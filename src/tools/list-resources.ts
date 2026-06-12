import { Types } from "graphlit-client";
import { z } from "zod";

import type { GraphlitAgentTool, GraphlitClient } from "../types.js";
import { throwIfAborted } from "../utils/abort.js";
import { clampInteger } from "../utils/clamp.js";
import {
  scalarToString,
  toCollectionResourceUri,
  toContentResourceUri,
  toConversationResourceUri,
  toEntityResourceUri,
  toFactResourceUri,
  toFeedResourceUri,
} from "../utils/content.js";
import { buildPublicContentFilter } from "../utils/filters.js";
import { isNotNullish } from "../utils/results.js";
import { createToolDefinition } from "../utils/schema.js";
import { truncateText } from "../utils/text.js";

const DEFAULT_LIMIT = 20;
const DEFAULT_MAX_LIMIT = 50;

export const ResourceKindSchema = z.enum([
  "contents",
  "collections",
  "feeds",
  "facts",
  "conversations",
  "entities",
]);

export const ListResourcesInputSchema = z.object({
  kinds: z
    .array(ResourceKindSchema)
    .optional()
    .describe("Resource kinds to list. Defaults to collections, feeds, and contents."),
  search: z.string().trim().min(1).optional().describe("Optional search text."),
  inLast: z.string().trim().min(1).optional().describe("Recent ISO 8601 duration."),
  limit: z.number().int().min(1).max(DEFAULT_MAX_LIMIT).optional(),
});

export type ResourceKind = z.infer<typeof ResourceKindSchema>;
export type ListResourcesArgs = z.infer<typeof ListResourcesInputSchema>;

export interface ListResourcesToolOptions {
  defaultKinds?: ResourceKind[];
  defaultLimit?: number;
  maxLimit?: number;
  correlationId?: string;
}

export interface ResourceDescriptor {
  uri: string;
  resourceUri: string;
  kind: ResourceKind;
  name: string;
  mimeType: string;
  description?: string;
}

export interface ListResourcesResult {
  resources: ResourceDescriptor[];
}

function descriptor(
  kind: ResourceKind,
  id: string,
  name: string,
  mimeType: string,
  description?: string,
): ResourceDescriptor {
  const uri =
    kind === "contents"
      ? toContentResourceUri(id)
      : kind === "collections"
        ? toCollectionResourceUri(id)
        : kind === "feeds"
          ? toFeedResourceUri(id)
          : kind === "facts"
            ? toFactResourceUri(id)
            : kind === "conversations"
              ? toConversationResourceUri(id)
              : toEntityResourceUri(id);

  return {
    uri: uri ?? `${kind}://${id}`,
    resourceUri: uri ?? `${kind}://${id}`,
    kind,
    name,
    mimeType,
    description,
  };
}

export function createListResourcesTool(
  client: GraphlitClient,
  options: ListResourcesToolOptions = {},
): GraphlitAgentTool<
  ListResourcesArgs,
  ListResourcesResult,
  typeof ListResourcesInputSchema
> {
  return {
    inputSchema: ListResourcesInputSchema,
    tool: createToolDefinition(
      "list_resources",
      "List Graphlit resource URIs that read_resource can dereference. Supports contents, collections, feeds, facts, conversations, and entities.",
      ListResourcesInputSchema,
    ),
    handler: async (rawArgs, _artifacts, abortSignal) => {
      throwIfAborted(abortSignal);

      const args = ListResourcesInputSchema.parse(rawArgs);
      const kinds = args.kinds ?? options.defaultKinds ?? ["collections", "feeds", "contents"];
      const limit = clampInteger(
        args.limit,
        options.defaultLimit ?? DEFAULT_LIMIT,
        1,
        options.maxLimit ?? DEFAULT_MAX_LIMIT,
      );
      const resources: ResourceDescriptor[] = [];

      if (kinds.includes("contents")) {
        const response = await client.queryContents(
          buildPublicContentFilter({ search: args.search, inLast: args.inLast }, {}, limit),
        );
        resources.push(
          ...(response.contents?.results?.filter(isNotNullish).map((content) =>
            descriptor(
              "contents",
              content.id,
              content.fileName || content.name,
              content.mimeType ?? "application/x.graphlit-content",
              content.type ? `Content: ${content.type}` : undefined,
            ),
          ) ?? []),
        );
      }

      if (kinds.includes("collections")) {
        const response = await client.queryCollections({
          search: args.search,
          createdInLast: args.inLast,
          limit,
          disableInheritance: true,
        });
        resources.push(
          ...(response.collections?.results?.filter(isNotNullish).map((collection) =>
            descriptor(
              "collections",
              collection.id,
              collection.name,
              "application/x.graphlit-collection",
              collection.type ? `Collection: ${collection.type}` : undefined,
            ),
          ) ?? []),
        );
      }

      if (kinds.includes("feeds")) {
        const response = await client.queryFeeds({
          search: args.search,
          createdInLast: args.inLast,
          limit,
        });
        resources.push(
          ...(response.feeds?.results?.filter(isNotNullish).map((feed) =>
            descriptor(
              "feeds",
              feed.id,
              feed.name,
              "application/x.graphlit-feed",
              `Feed: ${feed.type}`,
            ),
          ) ?? []),
        );
      }

      if (kinds.includes("facts")) {
        const response = await client.queryFacts(
          {
            search: args.search,
            searchType: args.search ? Types.SearchTypes.Hybrid : undefined,
            createdInLast: args.inLast,
            limit,
            disableInheritance: true,
          },
          options.correlationId,
        );
        resources.push(
          ...(response.facts?.results?.filter(isNotNullish).map((fact) =>
            descriptor(
              "facts",
              fact.id,
              truncateText(fact.text, 80).text || fact.id,
              "application/x.graphlit-fact",
              fact.category ? `Fact: ${fact.category}` : undefined,
            ),
          ) ?? []),
        );
      }

      if (kinds.includes("conversations")) {
        const response = await client.queryConversations({
          search: args.search,
          searchType: args.search ? Types.SearchTypes.Hybrid : undefined,
          createdInLast: args.inLast,
          limit,
        });
        resources.push(
          ...(response.conversations?.results?.filter(isNotNullish).map((conversation) =>
            descriptor(
              "conversations",
              conversation.id,
              conversation.name,
              "application/x.graphlit-conversation",
              conversation.type ? `Conversation: ${conversation.type}` : undefined,
            ),
          ) ?? []),
        );
      }

      if (kinds.includes("entities")) {
        const response = await client.queryGraph(
          {
            search: args.search,
            searchType: args.search ? Types.SearchTypes.Hybrid : undefined,
            createdInLast: args.inLast,
            limit,
            disableInheritance: true,
          },
          undefined,
          options.correlationId,
        );
        resources.push(
          ...(response.graph?.nodes?.filter(isNotNullish).map((entity) =>
            descriptor(
              "entities",
              entity.id,
              entity.name,
              "application/x.graphlit-entity",
              entity.type ? `Entity: ${entity.type}` : undefined,
            ),
          ) ?? []),
        );
      }

      return { resources };
    },
  };
}
