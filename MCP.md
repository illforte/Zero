## Zero MCP

## Capabilities

Zero MCP provides the following capabilities:

### Email Management

- `search_emails`: Search threads with summarized preview.
- `get_email_content`: Get full thread messages.
- `reply_to_thread`: Send a reply within a thread context.
- `mark_as_spam`: Move threads to Spam.
- `delete_threads`: Move threads to Trash.
- `archive_threads`: Move threads out of Inbox.
- `send_email`: Send new messages.
- `unsubscribe`: Use List-Unsubscribe headers.
- `get_mailbox_stats`: Unread/Total counts overview.

### Label Management

- `list_labels`: Get all available labels/folders.

### AI-Powered Features

- `summarize_thread`: AI-generated concise thread summaries (via LiteLLM).

## Deployment & Security

Zero MCP supports two transport modes:

### 1. Stdio (Local)
Standard stdin/stdout communication. Used by local agents.

### 2. SSE (Remote - lair404)
Exposed on port **5008**. 

**Security:** 
- Requires `Authorization: Bearer {MCP_API_KEY}` or `X-API-Key: {MCP_API_KEY}`.
- All actions are logged to stderr with the `[AUDIT]` prefix for traceability.

**Environment Configuration:**
- `MCP_TRANSPORT=sse`
- `PORT=5008`
- `MCP_API_KEY`: Secret token for authentication.
- `MAIL_ZERO_USER_EMAIL`: Default user email for the MCP instance.

## Usage with Gemini CLI / Claude Desktop

For local stdio usage:
```json
"mail-zero": {
  "command": "npm",
  "args": ["run", "mcp"],
  "cwd": "/Users/florian.scheugenpflug/Projekte/mail-zero-fork/tools/mail-server",
  "env": {
    "MAIL_ZERO_USER_EMAIL": "florian.scheugenpflug@lair404.xyz"
  }
}
```

