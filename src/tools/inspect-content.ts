import { z } from "zod";

import type { GraphlitAgentTool, GraphlitClient } from "../types.js";
import { throwIfAborted } from "../utils/abort.js";
import {
  contentName,
  parseContentResourceUri,
  scalarToString,
  toContentResourceUri,
} from "../utils/content.js";
import { isNotNullish, mapReference, type NamedReferenceResult } from "../utils/results.js";
import { createToolDefinition } from "../utils/schema.js";
import { truncateText } from "../utils/text.js";

const DEFAULT_MAX_TEXT_LENGTH = 20_000;

export const InspectContentInputSchema = z.object({
  id: z.string().trim().min(1).optional().describe("Graphlit content ID."),
  resourceUri: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("Graphlit content resource URI, such as contents://content-id."),
  mode: z
    .enum(["auto", "summary", "markdown"])
    .optional()
    .describe("Text to return. Defaults to auto."),
  maxTextLength: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("Maximum text length to return."),
  range: z
    .object({
      start: z.number().int().min(0).optional(),
      end: z.number().int().min(0).optional(),
    })
    .optional()
    .describe("Optional character range to slice from the selected text."),
  describeImage: z
    .boolean()
    .optional()
    .describe("Describe Graphlit imageUri using client.describeImage()."),
  imagePrompt: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("Prompt for describeImage when describeImage is true."),
});

export type InspectContentArgs = z.infer<typeof InspectContentInputSchema>;

export interface InspectContentToolOptions {
  maxTextLength?: number;
  describeImageSpecification?: { id: string };
  defaultImagePrompt?: string;
  correlationId?: string;
}

export interface InspectContentResult {
  id: string;
  resourceUri: string;
  name: string;
  uri?: string | null;
  type?: string | null;
  fileType?: string | null;
  mimeType?: string | null;
  parent?: NamedReferenceResult | null;
  children: NamedReferenceResult[];
  sourceUri?: string | null;
  mode: "auto" | "summary" | "markdown";
  text: string;
  truncated: boolean;
  range?: { start: number; end: number } | null;
  imageDescription?: string | null;
}

function resolveContentId(args: InspectContentArgs): string {
  const id = args.id ?? parseContentResourceUri(args.resourceUri);

  if (!id) {
    throw new Error("Provide either id or resourceUri.");
  }

  return id;
}

function applyRange(
  text: string,
  range: InspectContentArgs["range"],
): { text: string; range: { start: number; end: number } | null } {
  if (!range) {
    return { text, range: null };
  }

  const start = range.start ?? 0;
  const end = Math.min(range.end ?? text.length, text.length);

  if (end < start) {
    throw new Error("range.end must be greater than or equal to range.start.");
  }

  return {
    text: text.slice(start, end),
    range: { start, end },
  };
}

async function readExportText(uri: string, abortSignal?: AbortSignal): Promise<string> {
  const response = await fetch(uri, { signal: abortSignal });

  if (!response.ok) {
    throw new Error(`Failed to read Graphlit export URI: ${response.status}`);
  }

  return response.text();
}

export function createInspectContentTool(
  client: GraphlitClient,
  options: InspectContentToolOptions = {},
): GraphlitAgentTool<
  InspectContentArgs,
  InspectContentResult,
  typeof InspectContentInputSchema
> {
  return {
    inputSchema: InspectContentInputSchema,
    tool: createToolDefinition(
      "inspect_content",
      "Inspect one Graphlit content item returned by retrieve_contents, using its id or contents:// resource URI.",
      InspectContentInputSchema,
    ),
    handler: async (rawArgs, _artifacts, abortSignal) => {
      throwIfAborted(abortSignal);

      const args = InspectContentInputSchema.parse(rawArgs);
      const id = resolveContentId(args);
      const response = await client.getContent(id);
      const content = response.content;

      if (!content) {
        throw new Error(`Content not found: ${id}`);
      }

      const mode = args.mode ?? "auto";
      const maxTextLength =
        args.maxTextLength ?? options.maxTextLength ?? DEFAULT_MAX_TEXT_LENGTH;
      const exportUri =
        mode === "markdown"
          ? scalarToString(content.markdownUri)
          : mode === "auto"
            ? (scalarToString(content.markdownUri) ??
              scalarToString(content.textUri) ??
              scalarToString(content.transcriptUri))
            : null;
      const inlineText =
        mode === "summary"
          ? (content.customSummary ??
            content.summary ??
            content.snippet ??
            content.description)
          : mode === "markdown"
            ? content.markdown
            : (content.markdown ??
              content.customSummary ??
              content.summary ??
              content.snippet ??
              content.description);
      const textSource =
        args.range && exportUri
          ? await readExportText(exportUri, abortSignal)
          : (inlineText ??
            (exportUri ? await readExportText(exportUri, abortSignal) : ""));
      const ranged = applyRange(textSource, args.range);
      const { text, truncated } = truncateText(ranged.text, maxTextLength);
      const imageUri = scalarToString(content.imageUri);
      const imageDescription =
        args.describeImage && imageUri
          ? (
              await client.describeImage(
                args.imagePrompt ??
                  options.defaultImagePrompt ??
                  "Describe the image for an agent that needs to understand this Graphlit content.",
                imageUri,
                options.describeImageSpecification,
                options.correlationId,
              )
            ).describeImage?.message
          : null;

      return {
        id: content.id,
        resourceUri:
          toContentResourceUri(content.id) ?? `contents://${content.id}`,
        name: contentName(content),
        uri: scalarToString(content.uri),
        type: content.type,
        fileType: content.fileType,
        mimeType: content.mimeType,
        parent: content.parent ? mapReference(content.parent, "contents") : null,
        children:
          content.children?.filter(isNotNullish).map((child) => mapReference(child, "contents")) ?? [],
        sourceUri: exportUri,
        mode,
        text,
        truncated,
        range: ranged.range,
        imageDescription,
      };
    },
  };
}
