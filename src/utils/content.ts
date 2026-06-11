import type { Types } from "graphlit-client";

import type { ContentReference } from "../types.js";

export function toContentResourceUri(id: string | null | undefined): string | null {
  return id ? `contents://${id}` : null;
}

export function parseContentResourceUri(
  uri: string | null | undefined,
): string | null {
  if (!uri) {
    return null;
  }

  return uri.startsWith("contents://") ? uri.slice("contents://".length) : null;
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
  return collections?.map((collection) => collection.id).filter(Boolean) ?? [];
}

export function scalarToString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  return typeof value === "string" ? value : String(value);
}
