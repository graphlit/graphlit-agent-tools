import { Types } from "graphlit-client";
import { z } from "zod";

import type { GraphlitAgentTool, GraphlitClient } from "../types.js";
import { throwIfAborted } from "../utils/abort.js";
import { clampInteger } from "../utils/clamp.js";
import { buildPublicContentFilter } from "../utils/filters.js";
import { isNotNullish, mapCompactContent, mapGraphNode, mapReference, stripTypename, type CompactGraphNodeResult } from "../utils/results.js";
import { createToolDefinition } from "../utils/schema.js";

const DEFAULT_LIMIT = 10;
const DEFAULT_MAX_LIMIT = 50;

export const ExploreEntityInputSchema = z.object({
  ids: z.array(z.string().trim().min(1)).optional().describe("Entity IDs."),
  names: z.array(z.string().trim().min(1)).optional().describe("Entity names to resolve."),
  types: z.array(z.nativeEnum(Types.ObservableTypes)).optional(),
  search: z.string().trim().min(1).optional().describe("Topic to narrow related content/facts."),
  includeMetadata: z.boolean().optional(),
  limit: z.number().int().min(1).max(DEFAULT_MAX_LIMIT).optional(),
});

export type ExploreEntityArgs = z.infer<typeof ExploreEntityInputSchema>;

export interface ExploreEntityToolOptions {
  correlationId?: string;
  defaultLimit?: number;
  maxLimit?: number;
}

export interface ExploreEntityResult {
  entities: CompactGraphNodeResult[];
  relationships: Array<{
    sourceId: string;
    relation: string;
    direction: Types.RelationshipDirections;
    entity: CompactGraphNodeResult;
  }>;
  facts: unknown[];
  contents: ReturnType<typeof mapCompactContent>[];
  conversations: Array<ReturnType<typeof mapReference>>;
}

async function resolveNames(
  client: GraphlitClient,
  names: string[],
  types: Types.ObservableTypes[] | undefined,
  correlationId?: string,
): Promise<CompactGraphNodeResult[]> {
  const resolved: CompactGraphNodeResult[] = [];

  for (const name of names) {
    const response = await client.queryGraph(
      {
        search: name,
        searchType: Types.SearchTypes.Hybrid,
        types,
        limit: 1,
        disableInheritance: true,
      },
      undefined,
      correlationId,
    );
    const node = response.graph?.nodes?.find(Boolean);

    if (node) {
      resolved.push(mapGraphNode(node));
    }
  }

  return resolved;
}

export function createExploreEntityTool(
  client: GraphlitClient,
  options: ExploreEntityToolOptions = {},
): GraphlitAgentTool<
  ExploreEntityArgs,
  ExploreEntityResult,
  typeof ExploreEntityInputSchema
> {
  return {
    inputSchema: ExploreEntityInputSchema,
    tool: createToolDefinition(
      "explore_entity",
      "Explore entities, relationships, related facts, related contents, and related conversations without app-layer state.",
      ExploreEntityInputSchema,
    ),
    handler: async (rawArgs, _artifacts, abortSignal) => {
      throwIfAborted(abortSignal);

      const args = ExploreEntityInputSchema.parse(rawArgs);
      const limit = clampInteger(
        args.limit,
        options.defaultLimit ?? DEFAULT_LIMIT,
        1,
        options.maxLimit ?? DEFAULT_MAX_LIMIT,
      );
      const namedEntities = await resolveNames(
        client,
        args.names ?? [],
        args.types,
        options.correlationId,
      );
      const entityIds = [...new Set([...(args.ids ?? []), ...namedEntities.map((item) => item.id)])];

      if (entityIds.length === 0) {
        throw new Error("Provide at least one entity id or resolvable name.");
      }

      const lookups = await Promise.all(
        entityIds.map((id) =>
          client.lookupEntity(
            {
              id,
              includeMetadata: args.includeMetadata ?? false,
              limit,
              disableInheritance: true,
            },
            options.correlationId,
          ),
        ),
      );
      const entities = lookups
        .map((lookup) => lookup.lookupEntity?.entity)
        .filter(isNotNullish)
        .map(mapGraphNode);
      const relationships = lookups.flatMap((lookup) => {
        const sourceId = lookup.lookupEntity?.entity?.id;

        if (!sourceId) {
          return [];
        }

        return (
          lookup.lookupEntity?.relationships?.filter(isNotNullish).map((relationship) => ({
            sourceId,
            relation: relationship.relation,
            direction: relationship.direction,
            entity: mapGraphNode(relationship.entity),
          })) ?? []
        );
      });
      const search = args.search ?? entities.map((entity) => entity.name).join(" ");
      const [facts, contents, conversations] = await Promise.all([
        client.queryFacts(
          {
            search,
            searchType: Types.SearchTypes.Hybrid,
            limit,
            disableInheritance: true,
          },
          options.correlationId,
        ),
        client.queryContents(buildPublicContentFilter({ search }, {}, limit)),
        client.queryConversations({
          search,
          searchType: Types.SearchTypes.Hybrid,
          limit,
        }),
      ]);

      return {
        entities,
        relationships,
        facts: facts.facts?.results?.filter(isNotNullish).map(stripTypename) ?? [],
        contents:
          contents.contents?.results?.filter(isNotNullish).map((content) => mapCompactContent(content)) ?? [],
        conversations:
          conversations.conversations?.results
            ?.filter(isNotNullish)
            .map((conversation) => mapReference(conversation, "conversations")) ?? [],
      };
    },
  };
}
