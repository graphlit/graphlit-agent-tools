import { Types } from "graphlit-client";
import { z } from "zod";

import type {
  ContentReference,
  GraphlitAgentTool,
  GraphlitClient,
} from "../types.js";
import { throwIfAborted } from "../utils/abort.js";
import { buildPublicContentFilter } from "../utils/filters.js";
import { isNotNullish } from "../utils/results.js";
import { createToolDefinition } from "../utils/schema.js";

export const QueryContentFacetsInputSchema = z.object({
  search: z.string().trim().min(1).optional().describe("Text to search for."),
  inLast: z.string().trim().min(1).optional().describe("Original-date ISO duration."),
  from: z.string().trim().min(1).optional().describe("Original-date range start."),
  to: z.string().trim().min(1).optional().describe("Original-date range end."),
  type: z.nativeEnum(Types.ContentTypes).optional().describe("Content type."),
  fileType: z.nativeEnum(Types.FileTypes).optional().describe("File type."),
  collectionIds: z.array(z.string().trim().min(1)).optional(),
  feedIds: z.array(z.string().trim().min(1)).optional(),
  facets: z
    .array(z.nativeEnum(Types.ContentFacetTypes))
    .optional()
    .describe("Facet dimensions to query."),
});

export type QueryContentFacetsArgs = z.infer<
  typeof QueryContentFacetsInputSchema
>;

export interface QueryContentFacetsToolOptions {
  collectionId?: string;
  collections?: ContentReference[];
  baseFilter?: Types.ContentFilter;
  defaultFacets?: Types.ContentFacetTypes[];
  searchType?: Types.SearchTypes;
  correlationId?: string;
}

export interface QueryContentFacetsResult {
  facets: Array<{
    facet?: Types.ContentFacetTypes | null;
    count: number;
    type?: Types.FacetValueTypes | null;
    value?: string | null;
    range?: { from?: string | null; to?: string | null } | null;
    observable?: {
      id?: string;
      name?: string | null;
      type?: Types.ObservableTypes | null;
    } | null;
  }>;
}

export function createQueryContentFacetsTool(
  client: GraphlitClient,
  options: QueryContentFacetsToolOptions = {},
): GraphlitAgentTool<
  QueryContentFacetsArgs,
  QueryContentFacetsResult,
  typeof QueryContentFacetsInputSchema
> {
  return {
    inputSchema: QueryContentFacetsInputSchema,
    tool: createToolDefinition(
      "query_content_facets",
      "Query Graphlit content facet buckets for counts by type, date, observable, or other supported facet dimensions.",
      QueryContentFacetsInputSchema,
    ),
    handler: async (rawArgs, _artifacts, abortSignal) => {
      throwIfAborted(abortSignal);

      const args = QueryContentFacetsInputSchema.parse(rawArgs);
      const filter = buildPublicContentFilter(args, options);
      const facets = (args.facets ?? options.defaultFacets ?? []).map(
        (facet) => ({ facet }),
      );
      const response = await client.queryContentsFacets(
        filter,
        facets.length ? facets : undefined,
        options.correlationId,
      );

      return {
        facets:
          response.contents?.facets
            ?.filter(isNotNullish)
            .map((facet) => ({
              facet: facet.facet,
              count: Number(facet.count ?? 0),
              type: facet.type,
              value: facet.value,
              range: facet.range
                ? { from: facet.range.from, to: facet.range.to }
                : null,
              observable: facet.observable
                ? {
                    id: facet.observable.observable?.id,
                    name: facet.observable.observable?.name,
                    type: facet.observable.type,
                  }
                : null,
            })) ?? [],
      };
    },
  };
}
