import { Types } from "graphlit-client";
import { z } from "zod";

import type { GraphlitAgentTool, GraphlitClient } from "../types.js";
import { throwIfAborted } from "../utils/abort.js";
import { clampInteger } from "../utils/clamp.js";
import { isNotNullish, mapCompactFeed, type CompactFeedResult } from "../utils/results.js";
import { createToolDefinition } from "../utils/schema.js";

const DEFAULT_LIMIT = 20;
const DEFAULT_MAX_LIMIT = 100;

export const QueryFeedsInputSchema = z.object({
  search: z.string().trim().min(1).optional().describe("Feed name search."),
  type: z.nativeEnum(Types.FeedTypes).optional().describe("Feed type."),
  offset: z.number().int().min(0).optional().describe("Results to skip."),
  limit: z.number().int().min(1).max(DEFAULT_MAX_LIMIT).optional(),
});

export type QueryFeedsArgs = z.infer<typeof QueryFeedsInputSchema>;

export interface QueryFeedsToolOptions {
  baseFilter?: Types.FeedFilter;
  defaultLimit?: number;
  maxLimit?: number;
}

export interface QueryFeedsResult {
  results: CompactFeedResult[];
}

export function createQueryFeedsTool(
  client: GraphlitClient,
  options: QueryFeedsToolOptions = {},
): GraphlitAgentTool<
  QueryFeedsArgs,
  QueryFeedsResult,
  typeof QueryFeedsInputSchema
> {
  return {
    inputSchema: QueryFeedsInputSchema,
    tool: createToolDefinition(
      "query_feeds",
      "List Graphlit feeds by name, type, and pagination filters.",
      QueryFeedsInputSchema,
    ),
    handler: async (rawArgs, _artifacts, abortSignal) => {
      throwIfAborted(abortSignal);

      const args = QueryFeedsInputSchema.parse(rawArgs);
      const limit = clampInteger(
        args.limit,
        options.defaultLimit ?? DEFAULT_LIMIT,
        1,
        options.maxLimit ?? DEFAULT_MAX_LIMIT,
      );
      const response = await client.queryFeeds({
        ...options.baseFilter,
        search: args.search ?? options.baseFilter?.search,
        types: args.type ? [args.type] : options.baseFilter?.types,
        offset: args.offset ?? options.baseFilter?.offset,
        limit,
      });

      return {
        results: response.feeds?.results?.filter(isNotNullish).map(mapCompactFeed) ?? [],
      };
    },
  };
}
