import { Types } from "graphlit-client";

import { scalarToString } from "./content.js";
import { mapCompactContent } from "./results.js";

export interface PublishedContentResult {
  content: ReturnType<typeof mapCompactContent>;
  uri?: string | null;
  imageUri?: string | null;
  audioUri?: string | null;
  videoUri?: string | null;
  masterUri?: string | null;
  fileExtension?: string | null;
  format?: string | null;
}

export function mapPublishedContent(content: {
  id: string;
  name?: string | null;
  fileName?: string | null;
  uri?: unknown;
  imageUri?: unknown;
  audioUri?: unknown;
  masterUri?: unknown;
  type?: Types.ContentTypes | null;
  fileType?: Types.FileTypes | null;
  mimeType?: string | null;
  state?: Types.EntityState | null;
  creationDate?: unknown;
  originalDate?: unknown;
  relevance?: number | null;
  summary?: string | null;
  customSummary?: string | null;
  snippet?: string | null;
  description?: string | null;
  fileExtension?: string | null;
  format?: string | null;
}): PublishedContentResult {
  return {
    content: mapCompactContent(content),
    uri: scalarToString(content.uri),
    imageUri: scalarToString(content.imageUri),
    audioUri: scalarToString(content.audioUri),
    videoUri: scalarToString(content.masterUri),
    masterUri: scalarToString(content.masterUri),
    fileExtension: content.fileExtension,
    format: content.format,
  };
}

export function addPublishedArtifacts(
  contents: Array<{ id: string } | null> | null | undefined,
  artifacts?: { addPending?: (promise: Promise<{ id: string }>) => void },
): void {
  for (const content of contents ?? []) {
    if (content?.id) {
      artifacts?.addPending?.(Promise.resolve({ id: content.id }));
    }
  }
}
