import { Types } from "graphlit-client";
import { z } from "zod";

import type { GraphlitAgentTool, GraphlitClient } from "../types.js";
import { throwIfAborted } from "../utils/abort.js";
import { clampInteger } from "../utils/clamp.js";
import { entityRefs, scalarToString } from "../utils/content.js";
import { buildPublicContentFilter } from "../utils/filters.js";
import { isNotNullish, mapCompactContent } from "../utils/results.js";
import { createToolDefinition } from "../utils/schema.js";

const DEFAULT_LIMIT = 10;
const DEFAULT_MAX_LIMIT = 25;
const DEFAULT_MAX_BYTES = 2_000_000;

export const RetrieveImagesInputSchema = z.object({
  search: z.string().trim().min(1).optional(),
  contentIds: z.array(z.string().trim().min(1)).optional(),
  collectionIds: z.array(z.string().trim().min(1)).optional(),
  includeData: z.boolean().optional().describe("Fetch image bytes and return Base64 data."),
  maxBytes: z.number().int().min(1).optional().describe("Maximum bytes to fetch per image."),
  limit: z.number().int().min(1).max(DEFAULT_MAX_LIMIT).optional(),
});

export type RetrieveImagesArgs = z.infer<typeof RetrieveImagesInputSchema>;

export interface RetrieveImagesToolOptions {
  defaultLimit?: number;
  maxLimit?: number;
  maxBytes?: number;
}

export interface RetrievedImageResult {
  content: ReturnType<typeof mapCompactContent>;
  imageUri?: string | null;
  data?: string;
  dataMimeType?: string | null;
  truncated?: boolean;
}

export interface RetrieveImagesResult {
  results: RetrievedImageResult[];
}

async function fetchImageData(
  uri: string,
  maxBytes: number,
  abortSignal?: AbortSignal,
): Promise<{ data: string; mimeType: string | null; truncated: boolean }> {
  const response = await fetch(uri, { signal: abortSignal });

  if (!response.ok) {
    throw new Error(`Failed to fetch image ${uri}: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const truncated = buffer.length > maxBytes;
  const slice = truncated ? buffer.subarray(0, maxBytes) : buffer;

  return {
    data: slice.toString("base64"),
    mimeType: response.headers.get("content-type"),
    truncated,
  };
}

export function createRetrieveImagesTool(
  client: GraphlitClient,
  options: RetrieveImagesToolOptions = {},
): GraphlitAgentTool<
  RetrieveImagesArgs,
  RetrieveImagesResult,
  typeof RetrieveImagesInputSchema
> {
  return {
    inputSchema: RetrieveImagesInputSchema,
    tool: createToolDefinition(
      "retrieve_images",
      "Retrieve image content from Graphlit, optionally fetching image bytes as Base64.",
      RetrieveImagesInputSchema,
    ),
    handler: async (rawArgs, _artifacts, abortSignal) => {
      throwIfAborted(abortSignal);

      const args = RetrieveImagesInputSchema.parse(rawArgs);
      const limit = clampInteger(
        args.limit,
        options.defaultLimit ?? DEFAULT_LIMIT,
        1,
        options.maxLimit ?? DEFAULT_MAX_LIMIT,
      );
      const filter = buildPublicContentFilter(
        {
          search: args.search,
          fileType: Types.FileTypes.Image,
          collectionIds: args.collectionIds,
        },
        {},
        limit,
      );
      const response = await client.queryContents({
        ...filter,
        contents: args.contentIds?.length ? entityRefs(args.contentIds) : filter.contents,
      });
      const maxBytes = args.maxBytes ?? options.maxBytes ?? DEFAULT_MAX_BYTES;
      const results: RetrievedImageResult[] = [];

      for (const content of response.contents?.results?.filter(isNotNullish) ?? []) {
        throwIfAborted(abortSignal);
        const imageUri =
          scalarToString(content.imageUri) ??
          scalarToString(content.masterUri) ??
          scalarToString(content.uri);
        const result: RetrievedImageResult = {
          content: mapCompactContent(content),
          imageUri,
        };

        if (args.includeData && imageUri) {
          const fetched = await fetchImageData(imageUri, maxBytes, abortSignal);
          result.data = fetched.data;
          result.dataMimeType = fetched.mimeType;
          result.truncated = fetched.truncated;
        }

        results.push(result);
      }

      return { results };
    },
  };
}
