import { z } from "zod";

import type { GraphlitAgentTool, GraphlitClient } from "../types.js";
import { delay, throwIfAborted } from "../utils/abort.js";
import { clampInteger } from "../utils/clamp.js";
import { parseResourceUri } from "../utils/content.js";
import { createToolDefinition } from "../utils/schema.js";

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_POLL_INTERVAL_MS = 3_000;
const MIN_POLL_INTERVAL_MS = 250;
const MAX_TIMEOUT_MS = 600_000;

export const WaitFeedDoneInputSchema = z.object({
  id: z.string().trim().min(1).optional().describe("Graphlit feed ID."),
  resourceUri: z.string().trim().min(1).optional().describe("feeds:// resource URI."),
  timeoutMs: z.number().int().min(1).optional(),
  pollIntervalMs: z.number().int().min(MIN_POLL_INTERVAL_MS).optional(),
});

export type WaitFeedDoneArgs = z.infer<typeof WaitFeedDoneInputSchema>;

export interface WaitFeedDoneToolOptions {
  defaultTimeoutMs?: number;
  defaultPollIntervalMs?: number;
}

export interface WaitFeedDoneResult {
  id: string;
  done: boolean;
  attempts: number;
  elapsedMs: number;
}

function resolveFeedId(args: WaitFeedDoneArgs): string {
  const id = args.id ?? parseResourceUri(args.resourceUri, "feeds");

  if (!id) {
    throw new Error("Provide either id or resourceUri.");
  }

  return id;
}

export function createWaitFeedDoneTool(
  client: GraphlitClient,
  options: WaitFeedDoneToolOptions = {},
): GraphlitAgentTool<
  WaitFeedDoneArgs,
  WaitFeedDoneResult,
  typeof WaitFeedDoneInputSchema
> {
  return {
    inputSchema: WaitFeedDoneInputSchema,
    tool: createToolDefinition(
      "wait_feed_done",
      "Wait until a Graphlit feed has finished syncing.",
      WaitFeedDoneInputSchema,
    ),
    handler: async (rawArgs, _artifacts, abortSignal) => {
      throwIfAborted(abortSignal);

      const args = WaitFeedDoneInputSchema.parse(rawArgs);
      const id = resolveFeedId(args);
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

        const response = await client.isFeedDone(id);
        const done = response.isFeedDone?.result === true;

        if (done) {
          return { id, done: true, attempts, elapsedMs: Date.now() - startedAt };
        }

        await delay(pollIntervalMs, abortSignal);
      }

      return { id, done: false, attempts, elapsedMs: Date.now() - startedAt };
    },
  };
}
