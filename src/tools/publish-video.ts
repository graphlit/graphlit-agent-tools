import { Types } from "graphlit-client";
import { z } from "zod";

import type { GraphlitAgentTool, GraphlitClient } from "../types.js";
import { throwIfAborted } from "../utils/abort.js";
import { addPublishedArtifacts, mapPublishedContent, type PublishedContentResult } from "../utils/media.js";
import { isNotNullish } from "../utils/results.js";
import { createToolDefinition } from "../utils/schema.js";

export const PublishVideoInputSchema = z.object({
  text: z.string().trim().min(1).describe("Video prompt."),
  name: z.string().trim().min(1).optional(),
  textType: z.nativeEnum(Types.TextTypes).optional(),
  service: z.enum(["openai", "google"]).optional(),
  openAIModel: z.nativeEnum(Types.OpenAiVideoModels).optional(),
  openAISize: z.nativeEnum(Types.VideoSizeTypes).optional(),
  googleModel: z.nativeEnum(Types.GoogleVideoModels).optional(),
  googleAspectRatio: z.nativeEnum(Types.VideoAspectRatioTypes).optional(),
  seconds: z.number().int().min(1).max(12).optional(),
  seedContentId: z.string().trim().min(1).optional(),
  waitForCompletion: z.boolean().optional(),
});

export type PublishVideoArgs = z.infer<typeof PublishVideoInputSchema>;

export interface PublishVideoToolOptions {
  workflow?: Types.EntityReferenceInput;
  defaultService?: "openai" | "google";
  defaultWaitForCompletion?: boolean;
  correlationId?: string;
}

export interface PublishVideoResult {
  contents: PublishedContentResult[];
}

export function createPublishVideoTool(
  client: GraphlitClient,
  options: PublishVideoToolOptions = {},
): GraphlitAgentTool<
  PublishVideoArgs,
  PublishVideoResult,
  typeof PublishVideoInputSchema
> {
  return {
    inputSchema: PublishVideoInputSchema,
    tool: createToolDefinition(
      "publish_video",
      "Generate video content from a text prompt through Graphlit publishing.",
      PublishVideoInputSchema,
    ),
    handler: async (rawArgs, artifacts, abortSignal) => {
      throwIfAborted(abortSignal);

      const args = PublishVideoInputSchema.parse(rawArgs);
      const service = args.service ?? options.defaultService ?? "google";
      const connector: Types.ContentPublishingConnectorInput =
        service === "openai"
          ? {
              type: Types.ContentPublishingServiceTypes.OpenAiVideo,
              format: Types.ContentPublishingFormats.Mp4,
              openAIVideo: {
                model: args.openAIModel ?? Types.OpenAiVideoModels.Sora_2,
                seconds: args.seconds,
                size: args.openAISize,
                seed: args.seedContentId ? { id: args.seedContentId } : undefined,
              },
            }
          : {
              type: Types.ContentPublishingServiceTypes.GoogleVideo,
              format: Types.ContentPublishingFormats.Mp4,
              googleVideo: {
                model: args.googleModel ?? Types.GoogleVideoModels.Veo_3Fast,
                seconds: args.seconds,
                aspectRatio: args.googleAspectRatio,
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
