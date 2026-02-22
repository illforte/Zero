# AI Observability and Action Synchronization

This document describes the standardized structure for AI observability and the synchronization mechanism for AI actions in Zero.

## LiteLLM Proxy and Langfuse Observability

All LLM requests are routed through the LiteLLM proxy on `lair404`. To ensure proper cost tracking, routing, and Langfuse observability, we use standardized headers and metadata.

### Model Factory (`apps/server/src/lib/ai.ts`)

The `getModel` and `getMiniModel` functions have been enhanced to accept a `ModelMetadata` object:

```typescript
export interface ModelMetadata {
  user_id?: string;
  session_id?: string;
  trace_id?: string;
  project?: string;
  tags?: string[];
  [key: string]: any;
}
```

When using the OpenAI provider (LiteLLM), the factory automatically injects:

- `x-litellm-metadata`: JSON-encoded metadata for Langfuse.
- `x-litellm-user-id`: For per-user cost and trace tracking.

### Usage Example

```typescript
const model = getModel(undefined, {
  user_id: connectionId,
  tags: ['agent-chat'],
});
```

## Action Synchronization

AI actions (tagging, deleting, marking as read) must be synchronized between the remote provider (Gmail/Outlook) and the local Durable Object database.

### ZeroDriver Synchronization

Methods in `ZeroDriver` (`apps/server/src/routes/agent/index.ts`) follow this pattern:

1. Perform the remote operation via the driver.
2. Optimistically update the local SQL database.
3. Resolve label names to IDs using the user's label map to support natural language requests.

### RPC Delegation

The `DriverRpcDO` (`apps/server/src/routes/agent/rpc.ts`) acts as the entry point for AI tool calls. It delegates all state-modifying actions to `ZeroDriver` to ensure the synchronization logic is always executed.

## Modified Components

- **AI Chat**: Tracks `connectionId` and `zero-agent-chat` tag.
- **Search**: Tracks `zero-driver-search` or `generate-search-query`.
- **Compose**: Tracks `email-compose` and `email-subject-generation`.
- **Topics**: Tracks `generate-user-topics`.
- **Streaming Tools**: `webSearch` (Perplexity) now also includes LiteLLM metadata.
