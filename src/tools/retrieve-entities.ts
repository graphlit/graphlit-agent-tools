import { Types } from "graphlit-client";
import { z } from "zod";

import type { GraphlitAgentTool, GraphlitClient } from "../types.js";
import { throwIfAborted } from "../utils/abort.js";
import { clampInteger } from "../utils/clamp.js";
import { toEntityResourceUri } from "../utils/content.js";
import { isNotNullish } from "../utils/results.js";
import { createToolDefinition } from "../utils/schema.js";

const DEFAULT_LIMIT = 10;
const DEFAULT_MAX_LIMIT = 50;

export const RetrieveEntitiesInputSchema = z.object({
  prompt: z.string().trim().min(1).describe("Prompt describing entities to retrieve."),
  types: z.array(z.nativeEnum(Types.ObservableTypes)).optional(),
  searchType: z.nativeEnum(Types.SearchTypes).optional(),
  limit: z.number().int().min(1).max(DEFAULT_MAX_LIMIT).optional(),
});

export type RetrieveEntitiesArgs = z.infer<typeof RetrieveEntitiesInputSchema>;

export interface RetrieveEntitiesToolOptions {
  defaultLimit?: number;
  maxLimit?: number;
  defaultSearchType?: Types.SearchTypes;
  correlationId?: string;
}

export interface RetrieveEntitiesResult {
  results: Array<{
    id: string;
    resourceUri: string;
    name?: string | null;
    type: Types.ObservableTypes;
    relevance?: number | null;
    metadata?: string | null;
  }>;
}

export function createRetrieveEntitiesTool(
  client: GraphlitClient,
  options: RetrieveEntitiesToolOptions = {},
): GraphlitAgentTool<
  RetrieveEntitiesArgs,
  RetrieveEntitiesResult,
  typeof RetrieveEntitiesInputSchema
> {
  return {
    inputSchema: RetrieveEntitiesInputSchema,
    tool: createToolDefinition(
      "retrieve_entities",
      "Retrieve knowledge-graph entities relevant to a prompt.",
      RetrieveEntitiesInputSchema,
    ),
    handler: async (rawArgs, _artifacts, abortSignal) => {
      throwIfAborted(abortSignal);

      const args = RetrieveEntitiesInputSchema.parse(rawArgs);
      const limit = clampInteger(
        args.limit,
        options.defaultLimit ?? DEFAULT_LIMIT,
        1,
        options.maxLimit ?? DEFAULT_MAX_LIMIT,
      );
      const response = await client.retrieveEntities(
        args.prompt,
        args.types,
        args.searchType ?? options.defaultSearchType ?? Types.SearchTypes.Hybrid,
        limit,
        options.correlationId,
      );

      return {
        results:
          response.retrieveEntities?.results?.filter(isNotNullish).map((entity) => ({
            id: entity.id,
            resourceUri: toEntityResourceUri(entity.id) ?? `entities://${entity.id}`,
            name: entity.name,
            type: entity.type,
            relevance: entity.relevance,
            metadata: entity.metadata,
          })) ?? [],
      };
    },
  };
}
