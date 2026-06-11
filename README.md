# @graphlit/agent-tools

Top-level Graphlit tool factories for TypeScript apps that use `streamAgent()`.

This package gives developers a small set of Graphlit-backed tools they can choose from directly. It does not provide tool discovery, MCP server wrappers, approval middleware, or convenience bundles.

## Install

```bash
npm install graphlit-client @graphlit/agent-tools
```

## Basic `streamAgent()` Usage

```typescript
import { Graphlit } from "graphlit-client";
import {
  createInspectContentTool,
  createRetrieveContentsTool,
  createWebSearchTool,
} from "@graphlit/agent-tools";

const client = new Graphlit(
  process.env.GRAPHLIT_ORGANIZATION_ID!,
  process.env.GRAPHLIT_ENVIRONMENT_ID!,
  process.env.GRAPHLIT_JWT_SECRET!,
);

const retrieveContents = createRetrieveContentsTool(client);
const inspectContent = createInspectContentTool(client);
const webSearch = createWebSearchTool(client);

const selectedTools = [retrieveContents, inspectContent, webSearch];

await client.streamAgent(
  "What customer emails from last week mention onboarding risk?",
  (event) => {
    // Stream events to your UI.
  },
  undefined,
  undefined,
  selectedTools.map((tool) => tool.tool),
  Object.fromEntries(selectedTools.map((tool) => [tool.tool.name, tool.handler])),
  {
    maxToolRounds: 8,
  },
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  [
    "Use retrieve_contents before answering questions that depend on ingested Graphlit content.",
    "Use inspect_content when a retrieved result needs fuller text before making a source-backed claim.",
    "If retrieved evidence is weak or missing, say so plainly.",
  ].join(" "),
);
```

## Realistic Retrieval Examples

`retrieve_contents` supports both semantic retrieval and filter-only content lookup.

For a model prompt such as “show me all emails from last week,” the tool can be called without a text search:

```typescript
await retrieveContents.handler({
  type: "EMAIL",
  inLast: "P7D",
  limit: 25,
});
```

For RAG over specific content text, pass `search`:

```typescript
await retrieveContents.handler({
  search: "onboarding risk renewal blocker",
  type: "EMAIL",
  inLast: "P30D",
  limit: 10,
});
```

For upcoming calendar context:

```typescript
await retrieveContents.handler({
  type: "EVENT",
  inNext: "P7D",
  limit: 20,
});
```

When answer-critical evidence needs more context, inspect the `contents://...` reference returned by retrieval:

```typescript
await inspectContent.handler({
  resourceUri: "contents://content-id-from-retrieve-contents",
  mode: "markdown",
});
```

## Tools

| Factory | Tool name | SDK operation |
| --- | --- | --- |
| `createRetrieveContentsTool()` | `retrieve_contents` | `retrieveSources`, `lookupContents`, `queryContents` |
| `createInspectContentTool()` | `inspect_content` | `getContent` |
| `createWebSearchTool()` | `web_search` | `searchWeb` |
| `createIngestUrlTool()` | `ingest_url` | `ingestUri` |
| `createWaitContentDoneTool()` | `wait_content_done` | `isContentDone` |

Each factory returns:

```typescript
type GraphlitAgentTool = {
  tool: Types.ToolDefinitionInput;
  handler: NonNullable<Parameters<Graphlit["streamAgent"]>[5]>[string];
};
```

## Notes

- Run these tools server-side with Graphlit credentials.
- Tool schemas are authored with Zod and converted to Graphlit `ToolDefinitionInput`.
- Public options reuse `graphlit-client` SDK types where possible, including `Types.ContentFilter`, `Types.EntityReferenceInput`, `Types.RetrievalStrategyInput`, and `Types.RerankingStrategyInput`.
- Returned retrieval results include `contents://...` resource URIs for UI source rendering and follow-up inspection.
