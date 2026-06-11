import type { Graphlit, Types } from "graphlit-client";

export type GraphlitClient = Graphlit;

export type StreamAgentToolHandlers = NonNullable<
  Parameters<Graphlit["streamAgent"]>[5]
>;

export type StreamAgentToolHandler = StreamAgentToolHandlers[string];

export type StreamAgentArtifactCollector =
  Parameters<StreamAgentToolHandler>[1];

export type GraphlitToolHandler<TArgs = unknown, TResult = unknown> = (
  args: TArgs,
  artifacts?: StreamAgentArtifactCollector,
  abortSignal?: AbortSignal,
) => Promise<TResult>;

export interface GraphlitAgentTool<TArgs = unknown, TResult = unknown> {
  tool: Types.ToolDefinitionInput;
  handler: GraphlitToolHandler<TArgs, TResult>;
}

export type ContentReference = Types.EntityReferenceInput;
