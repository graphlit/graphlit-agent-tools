import type { Types } from "graphlit-client";

import {
  contentName,
  scalarToString,
  toCollectionResourceUri,
  toContentResourceUri,
  toConversationResourceUri,
  toEntityResourceUri,
  toFactResourceUri,
  toFeedResourceUri,
} from "./content.js";
import { truncateText } from "./text.js";

export interface NamedReferenceResult {
  id: string;
  name?: string | null;
  resourceUri: string;
}

export function isNotNullish<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

export interface CompactContentResult {
  id: string;
  resourceUri: string;
  name: string;
  uri?: string | null;
  type?: Types.ContentTypes | null;
  fileType?: Types.FileTypes | null;
  mimeType?: string | null;
  state?: Types.EntityState | null;
  creationDate?: string | null;
  originalDate?: string | null;
  relevance?: number | null;
  text?: string;
  truncated?: boolean;
}

export interface CompactCollectionResult {
  id: string;
  resourceUri: string;
  name: string;
  state?: Types.EntityState | null;
  type?: Types.CollectionTypes | null;
  creationDate?: string | null;
  modifiedDate?: string | null;
  relevance?: number | null;
}

export interface CompactFeedResult {
  id: string;
  resourceUri: string;
  name: string;
  identifier?: string | null;
  state?: Types.EntityState | null;
  type?: Types.FeedTypes | null;
  creationDate?: string | null;
  modifiedDate?: string | null;
  relevance?: number | null;
  readCount?: number | null;
  lastReadDate?: string | null;
  error?: string | null;
}

export interface CompactGraphNodeResult {
  id: string;
  resourceUri: string;
  name: string;
  type?: Types.EntityTypes | Types.ObservableTypes | null;
  metadata?: string | null;
  relevance?: number | null;
}

type ContentLike = {
  id: string;
  name?: string | null;
  fileName?: string | null;
  uri?: unknown;
  type?: Types.ContentTypes | null;
  fileType?: Types.FileTypes | null;
  mimeType?: string | null;
  state?: Types.EntityState | null;
  creationDate?: unknown;
  originalDate?: unknown;
  relevance?: number | null;
  customSummary?: string | null;
  summary?: string | null;
  snippet?: string | null;
  description?: string | null;
  markdown?: string | null;
};

export function mapCompactContent(
  content: ContentLike,
  maxTextLength = 2_000,
): CompactContentResult {
  const { text, truncated } = truncateText(
    content.customSummary ??
      content.summary ??
      content.snippet ??
      content.description ??
      content.markdown ??
      "",
    maxTextLength,
  );

  return {
    id: content.id,
    resourceUri: toContentResourceUri(content.id) ?? `contents://${content.id}`,
    name: contentName(content),
    uri: scalarToString(content.uri),
    type: content.type,
    fileType: content.fileType,
    mimeType: content.mimeType,
    state: content.state,
    creationDate: scalarToString(content.creationDate),
    originalDate: scalarToString(content.originalDate),
    relevance: content.relevance,
    text,
    truncated,
  };
}

export function mapCompactCollection(collection: {
  id: string;
  name: string;
  state?: Types.EntityState | null;
  type?: Types.CollectionTypes | null;
  creationDate?: unknown;
  modifiedDate?: unknown;
  relevance?: number | null;
}): CompactCollectionResult {
  return {
    id: collection.id,
    resourceUri:
      toCollectionResourceUri(collection.id) ?? `collections://${collection.id}`,
    name: collection.name,
    state: collection.state,
    type: collection.type,
    creationDate: scalarToString(collection.creationDate),
    modifiedDate: scalarToString(collection.modifiedDate),
    relevance: collection.relevance,
  };
}

export function mapCompactFeed(feed: {
  id: string;
  name: string;
  identifier?: string | null;
  state?: Types.EntityState | null;
  type?: Types.FeedTypes | null;
  creationDate?: unknown;
  modifiedDate?: unknown;
  relevance?: number | null;
  readCount?: number | null;
  lastReadDate?: unknown;
  error?: string | null;
}): CompactFeedResult {
  return {
    id: feed.id,
    resourceUri: toFeedResourceUri(feed.id) ?? `feeds://${feed.id}`,
    name: feed.name,
    identifier: feed.identifier,
    state: feed.state,
    type: feed.type,
    creationDate: scalarToString(feed.creationDate),
    modifiedDate: scalarToString(feed.modifiedDate),
    relevance: feed.relevance,
    readCount: feed.readCount,
    lastReadDate: scalarToString(feed.lastReadDate),
    error: feed.error,
  };
}

export function mapGraphNode(node: {
  id: string;
  name: string;
  type?: Types.EntityTypes | Types.ObservableTypes | null;
  metadata?: string | null;
  relevance?: number | null;
}): CompactGraphNodeResult {
  return {
    id: node.id,
    resourceUri: toEntityResourceUri(node.id) ?? `entities://${node.id}`,
    name: node.name,
    type: node.type,
    metadata: node.metadata,
    relevance: node.relevance,
  };
}

export function mapReference(
  value: { id: string; name?: string | null },
  kind: "collections" | "contents" | "conversations" | "entities" | "facts" | "feeds",
): NamedReferenceResult {
  const resourceUri =
    kind === "collections"
      ? toCollectionResourceUri(value.id)
      : kind === "contents"
        ? toContentResourceUri(value.id)
        : kind === "conversations"
          ? toConversationResourceUri(value.id)
          : kind === "entities"
            ? toEntityResourceUri(value.id)
            : kind === "facts"
              ? toFactResourceUri(value.id)
              : toFeedResourceUri(value.id);

  return {
    id: value.id,
    name: value.name,
    resourceUri: resourceUri ?? `${kind}://${value.id}`,
  };
}

export function stripTypename(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripTypename);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const output: Record<string, unknown> = {};

  for (const [key, nestedValue] of Object.entries(value)) {
    if (key !== "__typename" && nestedValue !== null && nestedValue !== undefined) {
      output[key] = stripTypename(nestedValue);
    }
  }

  return output;
}
