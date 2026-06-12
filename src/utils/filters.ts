import { Types } from "graphlit-client";

import type { ContentReference } from "../types.js";
import { entityRefs, normalizeCollections } from "./content.js";

export interface PublicContentFilterArgs {
  search?: string;
  inLast?: string;
  inNext?: string;
  from?: string;
  to?: string;
  type?: Types.ContentTypes;
  fileType?: Types.FileTypes;
  collectionIds?: string[];
  feedIds?: string[];
  offset?: number;
}

export interface PublicContentFilterOptions {
  collectionId?: string;
  collections?: ContentReference[];
  baseFilter?: Types.ContentFilter;
  searchType?: Types.SearchTypes;
}

export function buildPublicContentFilter(
  args: PublicContentFilterArgs,
  options: PublicContentFilterOptions = {},
  limit?: number,
): Types.ContentFilter {
  const optionCollections = normalizeCollections(options);
  const inputCollections = args.collectionIds?.length
    ? entityRefs(args.collectionIds)
    : undefined;
  const feeds = args.feedIds?.length ? entityRefs(args.feedIds) : undefined;
  const originalDateRange =
    args.from || args.to ? { from: args.from, to: args.to } : undefined;

  return {
    ...options.baseFilter,
    search: args.search ?? options.baseFilter?.search,
    searchType: args.search
      ? (options.searchType ??
        options.baseFilter?.searchType ??
        Types.SearchTypes.Hybrid)
      : options.baseFilter?.searchType,
    disableInheritance: options.baseFilter?.disableInheritance ?? true,
    collections:
      inputCollections ?? optionCollections ?? options.baseFilter?.collections,
    feeds: feeds ?? options.baseFilter?.feeds,
    inLast: args.inLast ?? options.baseFilter?.inLast,
    inNext: args.inNext ?? options.baseFilter?.inNext,
    originalDateRange: originalDateRange ?? options.baseFilter?.originalDateRange,
    types: args.type ? [args.type] : options.baseFilter?.types,
    fileTypes: args.fileType ? [args.fileType] : options.baseFilter?.fileTypes,
    offset: args.offset ?? options.baseFilter?.offset,
    limit: limit ?? options.baseFilter?.limit,
  };
}

export function contentReferenceIds(options: PublicContentFilterOptions): string[] {
  return (
    normalizeCollections(options)
      ?.map((collection) => collection.id)
      .filter((id): id is string => Boolean(id)) ?? []
  );
}
