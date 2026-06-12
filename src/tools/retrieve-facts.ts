import { Types } from "graphlit-client";
import { z } from "zod";

import type { GraphlitAgentTool, GraphlitClient } from "../types.js";
import { throwIfAborted } from "../utils/abort.js";
import { clampInteger } from "../utils/clamp.js";
import { entityRefs, scalarToString, toFactResourceUri } from "../utils/content.js";
import { isNotNullish, mapReference } from "../utils/results.js";
import { createToolDefinition } from "../utils/schema.js";

const DEFAULT_LIMIT = 10;
const DEFAULT_MAX_LIMIT = 50;

export const RetrieveFactsInputSchema = z.object({
  prompt: z.string().trim().min(1).describe("Prompt describing facts to retrieve."),
  search: z.string().trim().min(1).optional().describe("Optional fact text filter."),
  inLast: z.string().trim().min(1).optional().describe("Created-date ISO duration."),
  contentId: z.string().trim().min(1).optional(),
  conversationId: z.string().trim().min(1).optional(),
  feedIds: z.array(z.string().trim().min(1)).optional(),
  minConfidence: z.number().min(0).max(1).optional(),
  limit: z.number().int().min(1).max(DEFAULT_MAX_LIMIT).optional(),
});

export type RetrieveFactsArgs = z.infer<typeof RetrieveFactsInputSchema>;

export interface RetrieveFactsToolOptions {
  baseFilter?: Types.FactFilter;
  defaultLimit?: number;
  maxLimit?: number;
  correlationId?: string;
}

export interface RetrievedFactResult {
  id: string;
  resourceUri: string;
  text: string;
  relevance?: number | null;
  confidence?: number | null;
  category?: Types.FactCategory | null;
  creationDate?: string | null;
  content?: ReturnType<typeof mapReference> | null;
  conversation?: ReturnType<typeof mapReference> | null;
}

export interface RetrieveFactsResult {
  results: RetrievedFactResult[];
}

export function createRetrieveFactsTool(
  client: GraphlitClient,
  options: RetrieveFactsToolOptions = {},
): GraphlitAgentTool<
  RetrieveFactsArgs,
  RetrieveFactsResult,
  typeof RetrieveFactsInputSchema
> {
  return {
    inputSchema: RetrieveFactsInputSchema,
    tool: createToolDefinition(
      "retrieve_facts",
      "Retrieve Graphlit facts relevant to a prompt and optional fact filters.",
      RetrieveFactsInputSchema,
    ),
    handler: async (rawArgs, _artifacts, abortSignal) => {
      throwIfAborted(abortSignal);

      const args = RetrieveFactsInputSchema.parse(rawArgs);
      const limit = clampInteger(
        args.limit,
        options.defaultLimit ?? DEFAULT_LIMIT,
        1,
        options.maxLimit ?? DEFAULT_MAX_LIMIT,
      );
      const filter: Types.FactFilter = {
        ...options.baseFilter,
        search: args.search ?? options.baseFilter?.search,
        searchType: args.search
          ? (options.baseFilter?.searchType ?? Types.SearchTypes.Hybrid)
          : options.baseFilter?.searchType,
        createdInLast: args.inLast ?? options.baseFilter?.createdInLast,
        content: args.contentId ? { id: args.contentId } : options.baseFilter?.content,
        conversation: args.conversationId
          ? { id: args.conversationId }
          : options.baseFilter?.conversation,
        feeds: args.feedIds?.length ? entityRefs(args.feedIds) : options.baseFilter?.feeds,
        minConfidence: args.minConfidence ?? options.baseFilter?.minConfidence,
        limit,
      };
      const response = await client.retrieveFacts(args.prompt, filter, options.correlationId);

      return {
        results:
          response.retrieveFacts?.results?.filter(isNotNullish).map((result) => {
            const fact = result.fact;
            return {
              id: fact.id,
              resourceUri: toFactResourceUri(fact.id) ?? `facts://${fact.id}`,
              text: fact.text,
              relevance: result.relevance ?? fact.relevance,
              confidence: fact.confidence,
              category: fact.category,
              creationDate: scalarToString(fact.creationDate),
              content: fact.content ? mapReference(fact.content, "contents") : null,
              conversation: fact.conversation
                ? mapReference(fact.conversation, "conversations")
                : null,
            };
          }) ?? [],
      };
    },
  };
}
