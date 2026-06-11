import { z } from "zod";

import type { GraphlitAgentTool, GraphlitClient } from "../types.js";
import { delay, throwIfAborted } from "../utils/abort.js";
import { clampInteger } from "../utils/clamp.js";
import { parseContentResourceUri } from "../utils/content.js";
import { createToolDefinition } from "../utils/schema.js";

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_POLL_INTERVAL_MS = 2_000;
const MIN_POLL_INTERVAL_MS = 250;
const MAX_TIMEOUT_MS = 300_000;

export const WaitContentDoneInputSchema = z.object({
  id: z.string().trim().min(1).optional().describe("Graphlit content ID."),
  resourceUri: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("Graphlit content resource URI, such as contents://content-id."),
  timeoutMs: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("Maximum time to wait in milliseconds."),
  pollIntervalMs: z
    .number()
    .int()
    .min(MIN_POLL_INTERVAL_MS)
    .optional()
    .describe("Polling interval in milliseconds."),
});

export type WaitContentDoneArgs = z.infer<typeof WaitContentDoneInputSchema>;

export interface WaitContentDoneToolOptions {
  defaultTimeoutMs?: number;
  defaultPollIntervalMs?: number;
}

export interface WaitContentDoneResult {
  id: string;
  done: boolean;
  attempts: number;
  elapsedMs: number;
}

function resolveContentId(args: WaitContentDoneArgs): string {
  const id = args.id ?? parseContentResourceUri(args.resourceUri);

  if (!id) {
    throw new Error("Provide either id or resourceUri.");
  }

  return id;
}

export function createWaitContentDoneTool(
  client: GraphlitClient,
  options: WaitContentDoneToolOptions = {},
): GraphlitAgentTool<WaitContentDoneArgs, WaitContentDoneResult> {
  return {
    tool: createToolDefinition(
      "wait_content_done",
      "Wait until a Graphlit content item has finished processing.",
      WaitContentDoneInputSchema,
    ),
    handler: async (rawArgs, _artifacts, abortSignal) => {
      throwIfAborted(abortSignal);

      const args = WaitContentDoneInputSchema.parse(rawArgs);
      const id = resolveContentId(args);
      const timeoutMs = clampInteger(
        args.timeoutMs,
        options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS,
        1,
        MAX_TIMEOUT_MS,
      );
      const pollIntervalMs = clampInteger(
        args.pollIntervalMs,
        options.defaultPollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
        MIN_POLL_INTERVAL_MS,
        timeoutMs,
      );
      const startedAt = Date.now();
      let attempts = 0;

      while (Date.now() - startedAt <= timeoutMs) {
        throwIfAborted(abortSignal);
        attempts += 1;

        const response = await client.isContentDone(id);
        const done = response.isContentDone?.result === true;

        if (done) {
          return {
            id,
            done: true,
            attempts,
            elapsedMs: Date.now() - startedAt,
          };
        }

        await delay(pollIntervalMs, abortSignal);
      }

      return {
        id,
        done: false,
        attempts,
        elapsedMs: Date.now() - startedAt,
      };
    },
  };
}
