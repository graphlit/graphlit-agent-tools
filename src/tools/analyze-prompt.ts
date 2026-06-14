import { z } from "zod";

import type { GraphlitAgentTool } from "../types.js";
import { throwIfAborted } from "../utils/abort.js";
import { createToolDefinition } from "../utils/schema.js";

export const AnalyzePromptIntentSchema = z.enum([
  "direct_answer",
  "factual_lookup",
  "current_lookup",
  "summarization",
  "comparison",
  "deep_research",
  "analysis",
  "creative",
  "unclear",
]);

export const AnalyzePromptComplexitySchema = z.enum([
  "simple",
  "standard",
  "deep",
]);

export const AnalyzePromptSourceScopeSchema = z.enum([
  "provided_prompt",
  "uploaded_or_ingested_content",
  "public_web",
  "mapped_site",
]);

export const AnalyzePromptSubjectKindSchema = z.enum([
  "person",
  "organization",
  "product",
  "topic",
  "document",
  "url",
  "repo",
  "event",
  "other",
]);

export const AnalyzePromptSubjectRoleSchema = z.enum([
  "primary",
  "comparison",
  "context",
]);

export const AnalyzePromptEvidencePurposeSchema = z.enum([
  "retrieve_project_content",
  "inspect_known_content",
  "search_public_web",
  "map_site",
  "cross_check",
  "summarize_only",
]);

export const AnalyzePromptPrioritySchema = z.enum(["required", "preferred"]);

export const AnalyzePromptConstraintTypeSchema = z.enum([
  "recency",
  "source_quality",
  "scope",
  "format",
  "comparison",
  "uncertainty",
]);

export const AnalyzePromptAnswerShapeSchema = z.enum([
  "short_answer",
  "bullets",
  "report",
  "table",
  "blog_post",
  "comparison",
  "debug_explanation",
  "other",
]);

export const AnalyzePromptCitationExpectationSchema = z.enum([
  "none",
  "light",
  "source_labels",
  "explicit_urls",
]);

export const AnalyzePromptNextStepToolSchema = z.enum([
  "retrieve_contents",
  "inspect_content",
  "web_search",
  "web_map",
  "read_resource",
  "list_resources",
  "count_contents",
  "answer_directly",
]);

export const AnalyzePromptSubjectSchema = z.object({
  text: z.string().trim().min(1).describe("Subject text from the prompt."),
  kind: AnalyzePromptSubjectKindSchema.describe("Subject category."),
  role: AnalyzePromptSubjectRoleSchema.optional().describe(
    "Subject role in the request.",
  ),
});

export const AnalyzePromptEvidencePlanItemSchema = z.object({
  purpose: AnalyzePromptEvidencePurposeSchema.describe(
    "Evidence path this step is meant to cover.",
  ),
  queryOrTarget: z
    .string()
    .trim()
    .min(1)
    .describe("Concrete query, URL, resource, site root, or target."),
  priority: AnalyzePromptPrioritySchema.describe(
    "Whether this evidence step is required or preferred.",
  ),
  reason: z
    .string()
    .trim()
    .min(1)
    .describe("Why this evidence step matters for the answer."),
});

export const AnalyzePromptConstraintSchema = z.object({
  type: AnalyzePromptConstraintTypeSchema.describe("Constraint category."),
  instruction: z
    .string()
    .trim()
    .min(1)
    .describe("Concrete constraint to honor while answering."),
});

export const AnalyzePromptAnswerContractSchema = z.object({
  shape: AnalyzePromptAnswerShapeSchema.describe("Expected answer shape."),
  mustInclude: z
    .array(z.string().trim().min(1))
    .describe("Answer-critical items to include or gap-label."),
  citationExpectation: AnalyzePromptCitationExpectationSchema.describe(
    "How explicitly the final answer should cite or label sources.",
  ),
  gapHandling: z
    .string()
    .trim()
    .min(1)
    .describe("How to report missing, weak, stale, or contradictory evidence."),
});

export const AnalyzePromptNextStepSchema = z.object({
  tool: AnalyzePromptNextStepToolSchema.describe(
    "Recommended immediate next tool, or answer_directly.",
  ),
  parameters: z
    .record(z.unknown())
    .optional()
    .describe("Suggested parameters for the next tool, if known."),
  reason: z.string().trim().min(1).describe("Why this is the best next step."),
});

export const AnalyzePromptInputSchema = z.object({
  prompt: z
    .string()
    .trim()
    .min(1)
    .describe("The exact user prompt or current request to analyze."),
  retrievalNeeded: z
    .boolean()
    .describe(
      "Whether retrieval or follow-up tool work is needed before answering.",
    ),
  skipReason: z
    .string()
    .trim()
    .min(1)
    .nullable()
    .optional()
    .describe(
      "If retrievalNeeded is false, briefly explain why retrieval is unnecessary. Otherwise omit or use null.",
    ),
  intent: AnalyzePromptIntentSchema.describe("The user's primary intent."),
  complexity: AnalyzePromptComplexitySchema.describe(
    "Expected retrieval and reasoning depth.",
  ),
  sourceScopes: z
    .array(AnalyzePromptSourceScopeSchema)
    .describe(
      "Source universes selected by routing analysis. Use [] when retrievalNeeded is false.",
    ),
  subjects: z
    .array(AnalyzePromptSubjectSchema)
    .describe(
      "Concrete people, organizations, products, documents, URLs, repos, events, or topics named in the prompt.",
    ),
  evidencePlan: z
    .array(AnalyzePromptEvidencePlanItemSchema)
    .describe(
      "Purposeful evidence steps to attempt before synthesis. Use [] when retrievalNeeded is false.",
    ),
  constraints: z
    .array(AnalyzePromptConstraintSchema)
    .optional()
    .describe(
      "Important recency, source, scope, format, comparison, or uncertainty constraints.",
    ),
  answerContract: AnalyzePromptAnswerContractSchema.describe(
    "Expected final answer shape and evidence standard. This is routing guidance, not evidence.",
  ),
  nextStep: AnalyzePromptNextStepSchema.optional().describe(
    "Optional immediate next step when the best next tool and parameters are already clear.",
  ),
});

export type AnalyzePromptArgs = z.infer<typeof AnalyzePromptInputSchema>;
export type AnalyzePromptConstraint = z.infer<
  typeof AnalyzePromptConstraintSchema
>;

export type AnalyzePromptResult = Omit<AnalyzePromptArgs, "constraints"> & {
  type: "prompt_analysis";
  constraints: AnalyzePromptConstraint[];
};

export function createAnalyzePromptTool(): GraphlitAgentTool<
  AnalyzePromptArgs,
  AnalyzePromptResult,
  typeof AnalyzePromptInputSchema
> {
  return {
    inputSchema: AnalyzePromptInputSchema,
    tool: createToolDefinition(
      "analyze_prompt",
      "Analyze the current prompt into a compact routing contract before retrieval or action. This tool does not retrieve evidence, inspect sources, mutate Graphlit, or make policy decisions.",
      AnalyzePromptInputSchema,
    ),
    handler: async (rawArgs, _artifacts, abortSignal) => {
      throwIfAborted(abortSignal);

      const args = AnalyzePromptInputSchema.parse(rawArgs);
      const { constraints = [], ...rest } = args;

      return {
        type: "prompt_analysis",
        ...rest,
        constraints,
      };
    },
  };
}
