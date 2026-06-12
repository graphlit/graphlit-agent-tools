import { Types } from "graphlit-client";
import { z } from "zod";

import type { GraphlitAgentTool, GraphlitClient } from "../types.js";
import { throwIfAborted } from "../utils/abort.js";
import { clampInteger } from "../utils/clamp.js";
import { isNotNullish, mapCompactCollection, type CompactCollectionResult } from "../utils/results.js";
import { createToolDefinition } from "../utils/schema.js";

const DEFAULT_LIMIT = 20;
const DEFAULT_MAX_LIMIT = 100;

export const QueryCollectionsInputSchema = z.object({
  search: z.string().trim().min(1).optional().describe("Collection name search."),
  type: z.nativeEnum(Types.CollectionTypes).optional().describe("Collection type."),
  offset: z.number().int().min(0).optional().describe("Results to skip."),
  limit: z.number().int().min(1).max(DEFAULT_MAX_LIMIT).optional(),
});

export type QueryCollectionsArgs = z.infer<typeof QueryCollectionsInputSchema>;

export interface QueryCollectionsToolOptions {
  baseFilter?: Types.CollectionFilter;
  defaultLimit?: number;
  maxLimit?: number;
}

export interface QueryCollectionsResult {
  results: CompactCollectionResult[];
}

export function createQueryCollectionsTool(
  client: GraphlitClient,
  options: QueryCollectionsToolOptions = {},
): GraphlitAgentTool<
  QueryCollectionsArgs,
  QueryCollectionsResult,
  typeof QueryCollectionsInputSchema
> {
  return {
    inputSchema: QueryCollectionsInputSchema,
    tool: createToolDefinition(
      "query_collections",
      "List Graphlit collections by name, type, and pagination filters.",
      QueryCollectionsInputSchema,
    ),
    handler: async (rawArgs, _artifacts, abortSignal) => {
      throwIfAborted(abortSignal);

      const args = QueryCollectionsInputSchema.parse(rawArgs);
      const limit = clampInteger(
        args.limit,
        options.defaultLimit ?? DEFAULT_LIMIT,
        1,
        options.maxLimit ?? DEFAULT_MAX_LIMIT,
      );
      const response = await client.queryCollections({
        ...options.baseFilter,
        disableInheritance: options.baseFilter?.disableInheritance ?? true,
        search: args.search ?? options.baseFilter?.search,
        types: args.type ? [args.type] : options.baseFilter?.types,
        offset: args.offset ?? options.baseFilter?.offset,
        limit,
      });

      return {
        results:
          response.collections?.results?.filter(isNotNullish).map(mapCompactCollection) ?? [],
      };
    },
  };
}
