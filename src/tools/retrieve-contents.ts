import { Types } from "graphlit-client";
import { z } from "zod";

import type {
  ContentReference,
  GraphlitAgentTool,
  GraphlitClient,
} from "../types.js";
import { throwIfAborted } from "../utils/abort.js";
import { clampInteger } from "../utils/clamp.js";
import {
  collectionIds,
  contentName,
  normalizeCollections,
  scalarToString,
  toContentResourceUri,
} from "../utils/content.js";
import { createToolDefinition } from "../utils/schema.js";
import { truncateText } from "../utils/text.js";

const DEFAULT_LIMIT = 10;
const DEFAULT_MAX_LIMIT = 100;
const DEFAULT_MAX_TEXT_LENGTH = 4_000;

type QueryContentResult = NonNullable<
  NonNullable<Types.QueryContentsQuery["contents"]>["results"]
>[number];
type QueryContent = NonNullable<QueryContentResult>;

type LookupContentResult = NonNullable<
  NonNullable<Types.LookupContentsQuery["lookupContents"]>["results"]
>[number];
type LookupContent = NonNullable<LookupContentResult>;

type RetrievedSourceResult = NonNullable<
  NonNullable<Types.RetrieveSourcesMutation["retrieveSources"]>["results"]
>[number];
type RetrievedSource = NonNullable<RetrievedSourceResult>;

export const RetrieveContentsInputSchema = z.object({
  search: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe(
      "Specific text to match against content. Omit for filter-only lookups like all emails in the last week.",
    ),
  inLast: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe(
      "Backward-looking original-date filter as an ISO 8601 duration, such as P7D for the last 7 days.",
    ),
  inNext: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe(
      "Forward-looking original-date filter as an ISO 8601 duration, such as P3D for the next 3 days.",
    ),
  type: z
    .nativeEnum(Types.ContentTypes)
    .optional()
    .describe("Graphlit content type, such as EMAIL, EVENT, FILE, PAGE, or TEXT."),
  fileType: z
    .nativeEnum(Types.FileTypes)
    .optional()
    .describe("Graphlit file type, such as DOCUMENT, IMAGE, AUDIO, or VIDEO."),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Number of results to skip for filter-only pagination."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(DEFAULT_MAX_LIMIT)
    .optional()
    .describe("Maximum number of results. Defaults to 10."),
});

export type RetrieveContentsArgs = z.infer<typeof RetrieveContentsInputSchema>;

export interface RetrieveContentsToolOptions {
  collectionId?: string;
  collections?: ContentReference[];
  baseFilter?: Types.ContentFilter;
  defaultLimit?: number;
  maxLimit?: number;
  maxTextLength?: number;
  searchType?: Types.SearchTypes;
  retrievalStrategy?: Types.RetrievalStrategyInput;
  rerankingStrategy?: Types.RerankingStrategyInput;
  correlationId?: string;
}

export interface RetrievedContentResult {
  id: string;
  resourceUri: string;
  name: string;
  uri?: string | null;
  type?: Types.ContentTypes | null;
  fileType?: Types.FileTypes | null;
  mimeType?: string | null;
  creationDate?: string | null;
  originalDate?: string | null;
  relevance?: number | null;
  text: string;
  truncated: boolean;
  source?: {
    metadata?: string | null;
    pageNumber?: number | null;
    frameNumber?: number | null;
    startTime?: string | null;
    endTime?: string | null;
  };
}

export interface RetrieveContentsResult {
  search: string | null;
  collectionIds: string[];
  results: RetrievedContentResult[];
}

function buildFilter(
  args: RetrieveContentsArgs,
  options: RetrieveContentsToolOptions,
  limit: number,
): Types.ContentFilter {
  const collections = normalizeCollections(options);

  return {
    ...options.baseFilter,
    searchType: args.search
      ? (options.searchType ?? options.baseFilter?.searchType ?? Types.SearchTypes.Hybrid)
      : options.baseFilter?.searchType,
    disableInheritance: options.baseFilter?.disableInheritance ?? true,
    collections: collections ?? options.baseFilter?.collections,
    inLast: args.inLast ?? options.baseFilter?.inLast,
    inNext: args.inNext ?? options.baseFilter?.inNext,
    types: args.type ? [args.type] : options.baseFilter?.types,
    fileTypes: args.fileType ? [args.fileType] : options.baseFilter?.fileTypes,
    offset: args.search ? options.baseFilter?.offset : (args.offset ?? options.baseFilter?.offset),
    limit,
  };
}

function mapContentMetadata(
  content: QueryContent | LookupContent,
): Omit<RetrievedContentResult, "relevance" | "text" | "truncated" | "source"> {
  return {
    id: content.id,
    resourceUri: toContentResourceUri(content.id) ?? `contents://${content.id}`,
    name: contentName(content),
    uri: scalarToString(content.uri),
    type: content.type,
    fileType: content.fileType,
    mimeType: content.mimeType,
    creationDate: scalarToString(content.creationDate),
    originalDate: scalarToString(content.originalDate),
  };
}

function summarizeContent(
  content: QueryContent | LookupContent,
  maxTextLength: number,
): { text: string; truncated: boolean } {
  return truncateText(
    content.customSummary ??
      content.summary ??
      content.snippet ??
      content.description ??
      "",
    maxTextLength,
  );
}

function mapQueryContent(
  content: QueryContent,
  maxTextLength: number,
): RetrievedContentResult {
  const { text, truncated } = summarizeContent(content, maxTextLength);

  return {
    ...mapContentMetadata(content),
    relevance: content.relevance,
    text,
    truncated,
  };
}

function mapRetrievedSource(
  source: RetrievedSource,
  content: LookupContent,
  maxTextLength: number,
): RetrievedContentResult {
  const fallback = summarizeContent(content, maxTextLength);
  const sourceText = truncateText(source.text ?? fallback.text, maxTextLength);

  return {
    ...mapContentMetadata(content),
    relevance: source.relevance,
    text: sourceText.text,
    truncated: sourceText.truncated || fallback.truncated,
    source: {
      metadata: source.metadata,
      pageNumber: source.pageNumber,
      frameNumber: source.frameNumber,
      startTime: scalarToString(source.startTime),
      endTime: scalarToString(source.endTime),
    },
  };
}

export function createRetrieveContentsTool(
  client: GraphlitClient,
  options: RetrieveContentsToolOptions = {},
): GraphlitAgentTool<RetrieveContentsArgs, RetrieveContentsResult> {
  const defaultLimit = options.defaultLimit ?? DEFAULT_LIMIT;
  const maxLimit = options.maxLimit ?? DEFAULT_MAX_LIMIT;
  const maxTextLength = options.maxTextLength ?? DEFAULT_MAX_TEXT_LENGTH;

  return {
    tool: createToolDefinition(
      "retrieve_contents",
      "Retrieve Graphlit-ingested content for RAG. Use search for text matching, or omit search for filter-only requests such as all emails in the last week.",
      RetrieveContentsInputSchema,
    ),
    handler: async (rawArgs, _artifacts, abortSignal) => {
      throwIfAborted(abortSignal);

      const args = RetrieveContentsInputSchema.parse(rawArgs);
      const limit = clampInteger(args.limit, defaultLimit, 1, maxLimit);
      const filter = buildFilter(args, options, limit);
      const collections = normalizeCollections(options);

      if (!args.search) {
        const response = await client.queryContents(filter);
        const results =
          response.contents?.results
            ?.filter((content): content is QueryContent => content != null)
            .map((content) => mapQueryContent(content, maxTextLength)) ?? [];

        return {
          search: null,
          collectionIds: collectionIds(collections),
          results,
        };
      }

      const retrievalStrategy: Types.RetrievalStrategyInput =
        options.retrievalStrategy ?? {
          type: Types.RetrievalStrategyTypes.Section,
          contentLimit: limit,
          disableFallback: true,
        };

      const rerankingStrategy: Types.RerankingStrategyInput =
        options.rerankingStrategy ?? {
          serviceType: Types.RerankingModelServiceTypes.Cohere,
        };

      const retrieved = await client.retrieveSources(
        args.search,
        filter,
        undefined,
        retrievalStrategy,
        rerankingStrategy,
        options.correlationId,
      );

      const sources =
        retrieved.retrieveSources?.results?.filter(
          (source): source is RetrievedSource => Boolean(source?.content?.id),
        ) ?? [];

      const contentIds = [
        ...new Set(sources.map((source) => source.content.id)),
      ];

      const lookup =
        contentIds.length > 0 ? await client.lookupContents(contentIds) : undefined;
      const contentMap = new Map(
        (lookup?.lookupContents?.results ?? [])
          .filter((content): content is LookupContent => content != null)
          .map((content) => [content.id, content]),
      );

      const results = sources
        .map((source) => {
          const content = contentMap.get(source.content.id);
          return content
            ? mapRetrievedSource(source, content, maxTextLength)
            : null;
        })
        .filter(
          (result): result is RetrievedContentResult => result != null,
        );

      return {
        search: args.search,
        collectionIds: collectionIds(collections),
        results,
      };
    },
  };
}
