import { Types } from "graphlit-client";
import { z } from "zod";

import type { GraphlitAgentTool, GraphlitClient } from "../types.js";
import { throwIfAborted } from "../utils/abort.js";
import { addPublishedArtifacts, mapPublishedContent, type PublishedContentResult } from "../utils/media.js";
import { isNotNullish } from "../utils/results.js";
import { createToolDefinition } from "../utils/schema.js";

export const PublishAudioInputSchema = z.object({
  text: z.string().trim().min(1).describe("Text to render as audio."),
  name: z.string().trim().min(1).optional(),
  textType: z.nativeEnum(Types.TextTypes).optional(),
  voice: z.string().trim().min(1).optional().describe("ElevenLabs voice identifier."),
  model: z.nativeEnum(Types.ElevenLabsModels).optional(),
  waitForCompletion: z.boolean().optional(),
});

export type PublishAudioArgs = z.infer<typeof PublishAudioInputSchema>;

export interface PublishAudioToolOptions {
  workflow?: Types.EntityReferenceInput;
  defaultVoice?: string;
  defaultModel?: Types.ElevenLabsModels;
  defaultWaitForCompletion?: boolean;
  correlationId?: string;
}

export interface PublishAudioResult {
  contents: PublishedContentResult[];
}

export function createPublishAudioTool(
  client: GraphlitClient,
  options: PublishAudioToolOptions = {},
): GraphlitAgentTool<
  PublishAudioArgs,
  PublishAudioResult,
  typeof PublishAudioInputSchema
> {
  return {
    inputSchema: PublishAudioInputSchema,
    tool: createToolDefinition(
      "publish_audio",
      "Generate audio content from text through Graphlit publishing.",
      PublishAudioInputSchema,
    ),
    handler: async (rawArgs, artifacts, abortSignal) => {
      throwIfAborted(abortSignal);

      const args = PublishAudioInputSchema.parse(rawArgs);
      const response = await client.publishText(
        args.text,
        args.textType ?? Types.TextTypes.Plain,
        {
          type: Types.ContentPublishingServiceTypes.ElevenLabsAudio,
          format: Types.ContentPublishingFormats.Mp3,
          elevenLabs: {
            voice: args.voice ?? options.defaultVoice,
            model: args.model ?? options.defaultModel ?? Types.ElevenLabsModels.FlashV2_5,
          },
        },
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
