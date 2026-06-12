import type { Types } from "graphlit-client";

import type { ContentReference } from "../types.js";

export function toContentResourceUri(id: string | null | undefined): string | null {
  return id ? `contents://${id}` : null;
}

export function toCollectionResourceUri(
  id: string | null | undefined,
): string | null {
  return id ? `collections://${id}` : null;
}

export function toConversationResourceUri(
  id: string | null | undefined,
): string | null {
  return id ? `conversations://${id}` : null;
}

export function toEntityResourceUri(id: string | null | undefined): string | null {
  return id ? `entities://${id}` : null;
}

export function toFactResourceUri(id: string | null | undefined): string | null {
  return id ? `facts://${id}` : null;
}

export function toFeedResourceUri(id: string | null | undefined): string | null {
  return id ? `feeds://${id}` : null;
}

export function parseContentResourceUri(
  uri: string | null | undefined,
): string | null {
  if (!uri) {
    return null;
  }

  return uri.startsWith("contents://") ? uri.slice("contents://".length) : null;
}

export function parseResourceUri(
  uri: string | null | undefined,
  scheme: "collections" | "contents" | "conversations" | "entities" | "facts" | "feeds",
): string | null {
  if (!uri) {
    return null;
  }

  const prefix = `${scheme}://`;
  return uri.startsWith(prefix) ? uri.slice(prefix.length) : null;
}

export function contentName(content: {
  fileName?: string | null;
  name?: string | null;
}): string {
  return content.fileName || content.name || "Untitled content";
}

export function normalizeCollections(options: {
  collectionId?: string;
  collections?: ContentReference[];
}): Types.EntityReferenceInput[] | undefined {
  if (options.collections?.length) {
    return options.collections.map(({ id }) => ({ id }));
  }

  return options.collectionId ? [{ id: options.collectionId }] : undefined;
}

export function collectionIds(
  collections: Types.EntityReferenceInput[] | undefined,
): string[] {
  return collections?.map((collection) => collection.id).filter((id): id is string => Boolean(id)) ?? [];
}

export function entityRefs(ids: string[]): Types.EntityReferenceInput[] {
  return [...new Set(ids.map((id) => id.trim()).filter((id): id is string => Boolean(id)))].map((id) => ({
    id,
  }));
}

export function normalizeReferenceIds(
  ids: string[] | undefined,
  resourceUris: string[] | undefined,
  scheme: "collections" | "contents" | "conversations" | "entities" | "facts" | "feeds",
): string[] {
  const parsed =
    resourceUris
      ?.map((uri) => parseResourceUri(uri, scheme))
      .filter((id): id is string => Boolean(id)) ?? [];

  return [
    ...new Set(
      [...(ids ?? []), ...parsed]
        .map((id) => id.trim())
        .filter((id): id is string => Boolean(id)),
    ),
  ];
}

export function scalarToString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  return typeof value === "string" ? value : String(value);
}
