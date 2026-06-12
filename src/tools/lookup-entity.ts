import { Types } from "graphlit-client";
import { z } from "zod";

import type { GraphlitAgentTool, GraphlitClient } from "../types.js";
import { throwIfAborted } from "../utils/abort.js";
import { clampInteger } from "../utils/clamp.js";
import { isNotNullish, mapGraphNode, type CompactGraphNodeResult } from "../utils/results.js";
import { createToolDefinition } from "../utils/schema.js";

const DEFAULT_LIMIT = 25;
const DEFAULT_MAX_LIMIT = 100;

export const LookupEntityInputSchema = z.object({
  id: z.string().trim().min(1).optional().describe("Graphlit entity ID."),
  name: z.string().trim().min(1).optional().describe("Entity name to resolve."),
  types: z.array(z.nativeEnum(Types.ObservableTypes)).optional(),
  includeMetadata: z.boolean().optional(),
  limit: z.number().int().min(1).max(DEFAULT_MAX_LIMIT).optional(),
});

export type LookupEntityArgs = z.infer<typeof LookupEntityInputSchema>;

export interface LookupEntityToolOptions {
  defaultLimit?: number;
  maxLimit?: number;
  correlationId?: string;
}

export interface LookupEntityResult {
  entity: CompactGraphNodeResult | null;
  candidates: CompactGraphNodeResult[];
  relationships: Array<{
    relation: string;
    direction: Types.RelationshipDirections;
    entity: CompactGraphNodeResult;
  }>;
  totalCount: number;
}

async function resolveEntityId(
  client: GraphlitClient,
  args: LookupEntityArgs,
  correlationId?: string,
): Promise<{ id: string; candidates: CompactGraphNodeResult[] }> {
  if (args.id) {
    return { id: args.id, candidates: [] };
  }

  if (!args.name) {
    throw new Error("Provide either id or name.");
  }

  const response = await client.queryGraph(
    {
      search: args.name,
      searchType: Types.SearchTypes.Hybrid,
      types: args.types,
      limit: 5,
      disableInheritance: true,
    },
    undefined,
    correlationId,
  );
  const candidates = response.graph?.nodes?.filter(isNotNullish).map(mapGraphNode) ?? [];
  const first = candidates[0];

  if (!first) {
    throw new Error(`No entity matched: ${args.name}`);
  }

  return { id: first.id, candidates };
}

export function createLookupEntityTool(
  client: GraphlitClient,
  options: LookupEntityToolOptions = {},
): GraphlitAgentTool<
  LookupEntityArgs,
  LookupEntityResult,
  typeof LookupEntityInputSchema
> {
  return {
    inputSchema: LookupEntityInputSchema,
    tool: createToolDefinition(
      "lookup_entity",
      "Lookup one knowledge-graph entity and its relationships by ID or fuzzy name.",
      LookupEntityInputSchema,
    ),
    handler: async (rawArgs, _artifacts, abortSignal) => {
      throwIfAborted(abortSignal);

      const args = LookupEntityInputSchema.parse(rawArgs);
      const limit = clampInteger(
        args.limit,
        options.defaultLimit ?? DEFAULT_LIMIT,
        1,
        options.maxLimit ?? DEFAULT_MAX_LIMIT,
      );
      const resolved = await resolveEntityId(client, args, options.correlationId);
      const response = await client.lookupEntity(
        {
          id: resolved.id,
          includeMetadata: args.includeMetadata ?? false,
          limit,
          disableInheritance: true,
        },
        options.correlationId,
      );
      const lookup = response.lookupEntity;

      return {
        entity: lookup?.entity ? mapGraphNode(lookup.entity) : null,
        candidates: resolved.candidates,
        relationships:
          lookup?.relationships?.filter(isNotNullish).map((relationship) => ({
            relation: relationship.relation,
            direction: relationship.direction,
            entity: mapGraphNode(relationship.entity),
          })) ?? [],
        totalCount: lookup?.totalCount ?? 0,
      };
    },
  };
}
