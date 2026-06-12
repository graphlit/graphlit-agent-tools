import { Types } from "graphlit-client";
import { z } from "zod";

import type {
  ContentReference,
  GraphlitAgentTool,
  GraphlitClient,
} from "../types.js";
import { throwIfAborted } from "../utils/abort.js";
import {
  contentName,
  scalarToString,
  toContentResourceUri,
} from "../utils/content.js";
import { createToolDefinition } from "../utils/schema.js";

export const ScreenshotPageInputSchema = z.object({
  url: z.string().trim().url().describe("Public page URL to screenshot."),
  maximumHeight: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("Maximum screenshot height in pixels."),
  waitForCompletion: z
    .boolean()
    .optional()
    .describe("Whether Graphlit should process the screenshot synchronously."),
});

export type ScreenshotPageArgs = z.infer<typeof ScreenshotPageInputSchema>;

export interface ScreenshotPageToolOptions {
  collections?: ContentReference[];
  workflow?: Types.EntityReferenceInput;
  defaultWaitForCompletion?: boolean;
  correlationId?: string;
}

export interface ScreenshotPageResult {
  id: string;
  resourceUri: string;
  name: string;
  uri?: string | null;
  state?: Types.EntityState | null;
  type?: Types.ContentTypes | null;
  fileType?: Types.FileTypes | null;
  mimeType?: string | null;
  imageUri?: string | null;
  waitForCompletion: boolean;
}

export function createScreenshotPageTool(
  client: GraphlitClient,
  options: ScreenshotPageToolOptions = {},
): GraphlitAgentTool<
  ScreenshotPageArgs,
  ScreenshotPageResult,
  typeof ScreenshotPageInputSchema
> {
  return {
    inputSchema: ScreenshotPageInputSchema,
    tool: createToolDefinition(
      "screenshot_page",
      "Capture a public web page screenshot into Graphlit content.",
      ScreenshotPageInputSchema,
    ),
    handler: async (rawArgs, artifacts, abortSignal) => {
      throwIfAborted(abortSignal);

      const args = ScreenshotPageInputSchema.parse(rawArgs);
      const waitForCompletion =
        args.waitForCompletion ?? options.defaultWaitForCompletion ?? false;
      const response = await client.screenshotPage(
        args.url,
        args.maximumHeight,
        waitForCompletion,
        options.workflow,
        options.collections,
        options.correlationId,
      );
      const content = response.screenshotPage;

      if (!content) {
        throw new Error(`Failed to screenshot page: ${args.url}`);
      }

      artifacts?.addPending(Promise.resolve({ id: content.id }));

      return {
        id: content.id,
        resourceUri:
          toContentResourceUri(content.id) ?? `contents://${content.id}`,
        name: contentName(content),
        uri: scalarToString(content.uri),
        state: content.state,
        type: content.type,
        fileType: content.fileType,
        mimeType: content.mimeType,
        imageUri: scalarToString((content as { imageUri?: unknown }).imageUri),
        waitForCompletion,
      };
    },
  };
}
