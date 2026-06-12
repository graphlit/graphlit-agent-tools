import { Types } from "graphlit-client";
import { z } from "zod";

import type { GraphlitAgentTool, GraphlitClient } from "../types.js";
import { throwIfAborted } from "../utils/abort.js";
import { addPublishedArtifacts, mapPublishedContent, type PublishedContentResult } from "../utils/media.js";
import { isNotNullish } from "../utils/results.js";
import { createToolDefinition } from "../utils/schema.js";

export const PublishImageInputSchema = z.object({
  text: z.string().trim().min(1).describe("Image prompt."),
  name: z.string().trim().min(1).optional(),
  textType: z.nativeEnum(Types.TextTypes).optional(),
  service: z.enum(["openai", "google"]).optional(),
  format: z.nativeEnum(Types.ContentPublishingFormats).optional(),
  openAIModel: z.nativeEnum(Types.OpenAiImageModels).optional(),
  openAISize: z.nativeEnum(Types.OpenAiImageSizeTypes).optional(),
  openAIQuality: z.nativeEnum(Types.OpenAiImageQualityTypes).optional(),
  googleModel: z.nativeEnum(Types.GoogleImageModels).optional(),
  googleAspectRatio: z.nativeEnum(Types.GoogleImageAspectRatioTypes).optional(),
  googleResolution: z.nativeEnum(Types.GoogleImageResolutionTypes).optional(),
  count: z.number().int().min(1).max(4).optional(),
  seedContentId: z.string().trim().min(1).optional(),
  waitForCompletion: z.boolean().optional(),
});

export type PublishImageArgs = z.infer<typeof PublishImageInputSchema>;

export interface PublishImageToolOptions {
  workflow?: Types.EntityReferenceInput;
  defaultService?: "openai" | "google";
  defaultWaitForCompletion?: boolean;
  correlationId?: string;
}

export interface PublishImageResult {
  contents: PublishedContentResult[];
}

export function createPublishImageTool(
  client: GraphlitClient,
  options: PublishImageToolOptions = {},
): GraphlitAgentTool<
  PublishImageArgs,
  PublishImageResult,
  typeof PublishImageInputSchema
> {
  return {
    inputSchema: PublishImageInputSchema,
    tool: createToolDefinition(
      "publish_image",
      "Generate image content from a text prompt through Graphlit publishing.",
      PublishImageInputSchema,
    ),
    handler: async (rawArgs, artifacts, abortSignal) => {
      throwIfAborted(abortSignal);

      const args = PublishImageInputSchema.parse(rawArgs);
      const service = args.service ?? options.defaultService ?? "openai";
      const connector: Types.ContentPublishingConnectorInput =
        service === "google"
          ? {
              type: Types.ContentPublishingServiceTypes.GoogleImage,
              format: args.format ?? Types.ContentPublishingFormats.Png,
              googleImage: {
                model: args.googleModel ?? Types.GoogleImageModels.Gemini_3_1FlashImagePreview,
                aspectRatio: args.googleAspectRatio,
                resolution: args.googleResolution,
                count: args.count,
                seed: args.seedContentId ? { id: args.seedContentId } : undefined,
              },
            }
          : {
              type: Types.ContentPublishingServiceTypes.OpenAiImage,
              format: args.format ?? Types.ContentPublishingFormats.Png,
              openAIImage: {
                model: args.openAIModel ?? Types.OpenAiImageModels.GptImage_2,
                size: args.openAISize,
                quality: args.openAIQuality,
                count: args.count,
                seed: args.seedContentId ? { id: args.seedContentId } : undefined,
              },
            };
      const response = await client.publishText(
        args.text,
        args.textType ?? Types.TextTypes.Plain,
        connector,
        args.name,
        options.workflow,
        args.waitForCompletion ?? options.defaultWaitForCompletion ?? false,
        options.correlationId,
      );
      const contents = response.publishText?.contents?.filter(isNotNullish) ?? [];
      addPublishedArtifacts(contents, artifacts);

      return { contents: contents.map(mapPublishedContent) };
    },
  };
}
