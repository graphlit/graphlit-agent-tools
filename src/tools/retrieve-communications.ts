import { Types } from "graphlit-client";
import { z } from "zod";

import type {
  ContentReference,
  GraphlitAgentTool,
  GraphlitClient,
} from "../types.js";
import { throwIfAborted } from "../utils/abort.js";
import { clampInteger } from "../utils/clamp.js";
import { buildPublicContentFilter } from "../utils/filters.js";
import { isNotNullish, mapCompactContent, type CompactContentResult } from "../utils/results.js";
import { createToolDefinition } from "../utils/schema.js";

const DEFAULT_LIMIT = 10;
const DEFAULT_MAX_LIMIT = 50;

const CommunicationChannelSchema = z.enum([
  "email",
  "event",
  "message",
  "post",
  "issue",
  "pull_request",
]);

export const RetrieveCommunicationsInputSchema = z.object({
  query: z.string().trim().min(1).optional().describe("Topic or body text to retrieve."),
  people: z.array(z.string().trim().min(1)).optional().describe("Person names."),
  organizations: z.array(z.string().trim().min(1)).optional().describe("Organization names."),
  emails: z.array(z.string().trim().email()).optional(),
  domains: z.array(z.string().trim().min(1)).optional(),
  channels: z.array(CommunicationChannelSchema).optional(),
  inLast: z.string().trim().min(1).optional(),
  limit: z.number().int().min(1).max(DEFAULT_MAX_LIMIT).optional(),
});

export type RetrieveCommunicationsArgs = z.infer<
  typeof RetrieveCommunicationsInputSchema
>;

export interface RetrieveCommunicationsToolOptions {
  collectionId?: string;
  collections?: ContentReference[];
  contentFilter?: Types.ContentFilter;
  defaultChannels?: Array<z.infer<typeof CommunicationChannelSchema>>;
  defaultLimit?: number;
  maxLimit?: number;
  searchType?: Types.SearchTypes;
  retrievalStrategy?: Types.RetrievalStrategyInput;
  rerankingStrategy?: Types.RerankingStrategyInput;
  correlationId?: string;
}

export interface RetrievedCommunicationResult extends CompactContentResult {
  matchReasons: string[];
}

export interface RetrieveCommunicationsResult {
  people: Array<{ query: string; matches: Array<{ id: string; name: string; email?: string | null }> }>;
  organizations: Array<{ query: string; matches: Array<{ id: string; name: string; uri?: string | null }> }>;
  results: RetrievedCommunicationResult[];
  warnings: string[];
}

function channelTypes(channels: Array<z.infer<typeof CommunicationChannelSchema>>) {
  const typeByChannel: Record<z.infer<typeof CommunicationChannelSchema>, Types.ContentTypes> = {
    email: Types.ContentTypes.Email,
    event: Types.ContentTypes.Event,
    message: Types.ContentTypes.Message,
    post: Types.ContentTypes.Post,
    issue: Types.ContentTypes.Issue,
    pull_request: Types.ContentTypes.PullRequest,
  };

  return [...new Set(channels.map((channel) => typeByChannel[channel]))];
}

function matchReasons(content: unknown, args: RetrieveCommunicationsArgs): string[] {
  const haystack = JSON.stringify(content).toLowerCase();
  const reasons: string[] = [];

  for (const email of args.emails ?? []) {
    if (haystack.includes(email.toLowerCase())) {
      reasons.push(`exact email: ${email}`);
    }
  }

  for (const domain of args.domains ?? []) {
    if (haystack.includes(domain.toLowerCase())) {
      reasons.push(`domain: ${domain}`);
    }
  }

  for (const person of args.people ?? []) {
    if (haystack.includes(person.toLowerCase())) {
      reasons.push(`person: ${person}`);
    }
  }

  for (const organization of args.organizations ?? []) {
    if (haystack.includes(organization.toLowerCase())) {
      reasons.push(`organization: ${organization}`);
    }
  }

  if (args.query) {
    reasons.push(`topic: ${args.query}`);
  }

  return reasons.length ? reasons : ["content matched Graphlit retrieval filter"];
}

export function createRetrieveCommunicationsTool(
  client: GraphlitClient,
  options: RetrieveCommunicationsToolOptions = {},
): GraphlitAgentTool<
  RetrieveCommunicationsArgs,
  RetrieveCommunicationsResult,
  typeof RetrieveCommunicationsInputSchema
> {
  return {
    inputSchema: RetrieveCommunicationsInputSchema,
    tool: createToolDefinition(
      "retrieve_communications",
      "Retrieve communications such as emails, calendar events, messages, posts, issues, and pull requests by participants, domains, topic, and recency.",
      RetrieveCommunicationsInputSchema,
    ),
    handler: async (rawArgs, _artifacts, abortSignal) => {
      throwIfAborted(abortSignal);

      const args = RetrieveCommunicationsInputSchema.parse(rawArgs);
      const limit = clampInteger(
        args.limit,
        options.defaultLimit ?? DEFAULT_LIMIT,
        1,
        options.maxLimit ?? DEFAULT_MAX_LIMIT,
      );
      const [people, organizations] = await Promise.all([
        Promise.all(
          (args.people ?? []).map(async (person) => {
            const response = await client.queryPersons(
              { search: person, searchType: Types.SearchTypes.Hybrid, limit: 5, disableInheritance: true },
              options.correlationId,
            );

            return {
              query: person,
              matches:
                response.persons?.results?.filter(isNotNullish).map((match) => ({
                  id: match.id,
                  name: match.name,
                  email: match.email,
                })) ?? [],
            };
          }),
        ),
        Promise.all(
          (args.organizations ?? []).map(async (organization) => {
            const response = await client.queryOrganizations(
              { search: organization, searchType: Types.SearchTypes.Hybrid, limit: 5, disableInheritance: true },
              options.correlationId,
            );

            return {
              query: organization,
              matches:
                response.organizations?.results?.filter(isNotNullish).map((match) => ({
                  id: match.id,
                  name: match.name,
                  uri: match.uri ? String(match.uri) : null,
                })) ?? [],
            };
          }),
        ),
      ]);
      const channels = args.channels ?? options.defaultChannels ?? ["email", "event", "message"];
      const terms = [
        args.query,
        ...(args.people ?? []),
        ...(args.organizations ?? []),
        ...(args.emails ?? []),
        ...(args.domains ?? []),
      ].filter((term): term is string => Boolean(term));
      const search = terms.join(" ") || undefined;
      const filter = buildPublicContentFilter(
        { search, inLast: args.inLast },
        {
          collectionId: options.collectionId,
          collections: options.collections,
          baseFilter: {
            ...options.contentFilter,
            types: channelTypes(channels),
          },
          searchType: options.searchType,
        },
        limit,
      );
      const response = await client.queryContents(filter);
      const results =
        response.contents?.results?.filter(isNotNullish).map((content) => ({
          ...mapCompactContent(content),
          matchReasons: matchReasons(content, args),
        })) ?? [];

      return {
        people,
        organizations,
        results,
        warnings: results.length
          ? []
          : ["No communications matched the public Graphlit filter."],
      };
    },
  };
}
