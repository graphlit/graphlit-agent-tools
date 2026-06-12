import { Types } from "graphlit-client";
import { z } from "zod";

import type {
  ContentReference,
  GraphlitAgentTool,
  GraphlitClient,
} from "../types.js";
import { throwIfAborted } from "../utils/abort.js";
import { clampInteger } from "../utils/clamp.js";
import { entityRefs, normalizeCollections, scalarToString, toConversationResourceUri } from "../utils/content.js";
import { createToolDefinition } from "../utils/schema.js";

const DEFAULT_LIMIT = 10;
const DEFAULT_MAX_LIMIT = 50;

export const RetrieveConversationsInputSchema = z.object({
  search: z.string().trim().min(1).optional().describe("Conversation search text."),
  name: z.string().trim().min(1).optional().describe("Conversation name filter."),
  type: z.nativeEnum(Types.ConversationTypes).optional().describe("Conversation type."),
  inLast: z.string().trim().min(1).optional().describe("Created-date ISO duration."),
  collectionIds: z.array(z.string().trim().min(1)).optional(),
  offset: z.number().int().min(0).optional(),
  limit: z.number().int().min(1).max(DEFAULT_MAX_LIMIT).optional(),
});

export type RetrieveConversationsArgs = z.infer<
  typeof RetrieveConversationsInputSchema
>;

export interface RetrieveConversationsToolOptions {
  collectionId?: string;
  collections?: ContentReference[];
  baseFilter?: Types.ConversationFilter;
  defaultLimit?: number;
  maxLimit?: number;
  searchType?: Types.SearchTypes;
}

export interface RetrievedConversationResult {
  id: string;
  resourceUri: string;
  name: string;
  state?: Types.EntityState | null;
  type?: Types.ConversationTypes | null;
  creationDate?: string | null;
  modifiedDate?: string | null;
  relevance?: number | null;
}

export interface RetrieveConversationsResult {
  results: RetrievedConversationResult[];
}

export function createRetrieveConversationsTool(
  client: GraphlitClient,
  options: RetrieveConversationsToolOptions = {},
): GraphlitAgentTool<
  RetrieveConversationsArgs,
  RetrieveConversationsResult,
  typeof RetrieveConversationsInputSchema
> {
  return {
    inputSchema: RetrieveConversationsInputSchema,
    tool: createToolDefinition(
      "retrieve_conversations",
      "Retrieve Graphlit conversations by search text, collection scope, and recency filters.",
      RetrieveConversationsInputSchema,
    ),
    handler: async (rawArgs, _artifacts, abortSignal) => {
      throwIfAborted(abortSignal);

      const args = RetrieveConversationsInputSchema.parse(rawArgs);
      const collections = args.collectionIds?.length
        ? entityRefs(args.collectionIds)
        : normalizeCollections(options);
      const limit = clampInteger(
        args.limit,
        options.defaultLimit ?? DEFAULT_LIMIT,
        1,
        options.maxLimit ?? DEFAULT_MAX_LIMIT,
      );
      const response = await client.queryConversations({
        ...options.baseFilter,
        search: args.search ?? options.baseFilter?.search,
        searchType: args.search
          ? (options.searchType ?? options.baseFilter?.searchType ?? Types.SearchTypes.Hybrid)
          : options.baseFilter?.searchType,
        name: args.name ?? options.baseFilter?.name,
        collections: collections ?? options.baseFilter?.collections,
        createdInLast: args.inLast ?? options.baseFilter?.createdInLast,
        types: args.type ? [args.type] : options.baseFilter?.types,
        offset: args.offset ?? options.baseFilter?.offset,
        limit,
      });

      return {
        results:
          response.conversations?.results?.filter(Boolean).map((conversation) => ({
            id: conversation.id,
            resourceUri:
              toConversationResourceUri(conversation.id) ??
              `conversations://${conversation.id}`,
            name: conversation.name,
            state: conversation.state,
            type: conversation.type,
            creationDate: scalarToString(conversation.creationDate),
            modifiedDate: scalarToString(conversation.modifiedDate),
            relevance: conversation.relevance,
          })) ?? [],
      };
    },
  };
}
