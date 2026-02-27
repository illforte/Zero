## Mail-Zero MCP Servers

This repo provides two MCP servers:

| Server | Port | Transport | Purpose |
|--------|------|-----------|---------|
| Zero Email MCP | 5008 | SSE | Email management (mail-zero backend) |
| Google Workspace MCP | 5009 | streamable-http | Calendar, Drive, Docs, Sheets, and more |

---

## 1. Zero Email MCP (port 5008)

### Capabilities

#### Email Management

- `search_emails`: Search threads with summarized preview.
- `get_email_content`: Get full thread messages.
- `reply_to_thread`: Send a reply within a thread context.
- `mark_as_spam`: Move threads to Spam.
- `delete_threads`: Move threads to Trash.
- `archive_threads`: Move threads out of Inbox.
- `send_email`: Send new messages.
- `unsubscribe`: Use List-Unsubscribe headers.
- `get_mailbox_stats`: Unread/Total counts overview.

#### Label Management

- `list_labels`: Get all available labels/folders.

#### AI-Powered Features

- `summarize_thread`: AI-generated concise thread summaries (via LiteLLM).

### Deployment

- **Transport:** SSE (`MCP_TRANSPORT=sse`) or stdio (local dev)
- **Auth:** `Authorization: Bearer {MCP_API_KEY}` or `X-API-Key: {MCP_API_KEY}`
- **Environment:** `MCP_TRANSPORT=sse`, `PORT=5008`, `MCP_API_KEY`, `MAIL_ZERO_USER_EMAIL`
- All actions logged to stderr with `[AUDIT]` prefix.

### Local Usage (stdio)

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

---

## 2. Google Workspace MCP (port 5009)

Vendored from [taylorwilsdon/google_workspace_mcp](https://github.com/taylorwilsdon/google_workspace_mcp) into `tools/google-workspace-mcp/`.

### Capabilities

#### Gmail
- `search_emails`: Search Gmail messages with query syntax.
- `get_email`: Get full email content by ID.
- `send_email`: Send new emails.
- `reply_to_email`: Reply to existing email threads.
- `draft_email`: Create draft emails.
- `manage_labels`: Create, update, delete Gmail labels.
- `bulk_manage_emails`: Batch operations on emails.

#### Google Calendar
- `list_events`: List upcoming calendar events.
- `create_event`: Create calendar events with attendees.
- `update_event`: Modify existing events.
- `delete_event`: Remove calendar events.

#### Google Drive
- `search_files`: Search for files and folders.
- `read_file`: Read file content.
- `create_file`: Create new files.
- `share_file`: Share files with permissions.

#### Google Docs
- `read_document`: Read document content.
- `create_document`: Create new documents.
- `update_document`: Modify document content.
- `append_to_document`: Append content to existing docs.

#### Google Sheets
- `read_spreadsheet`: Read spreadsheet data.
- `create_spreadsheet`: Create new spreadsheets.
- `update_cells`: Update cell values.
- `append_rows`: Append rows to sheets.

#### Google Slides
- `read_presentation`: Read slide content.
- `create_presentation`: Create new presentations.

#### Google Tasks
- `list_tasks`: List tasks from task lists.
- `create_task`: Create new tasks.
- `update_task`: Update existing tasks.
- `complete_task`: Mark tasks as complete.

#### Google Contacts
- `search_contacts`: Search contacts.
- `create_contact`: Create new contacts.

#### Google Chat
- `list_spaces`: List Chat spaces.
- `send_message`: Send Chat messages.

#### Google Forms
- `get_form`: Read form structure and responses.

#### Apps Script
- `list_projects`: List Apps Script projects.
- `run_script`: Execute Apps Script functions.

### Deployment

- **Transport:** streamable-http (`--transport streamable-http`)
- **Port:** 5009 (`WORKSPACE_MCP_PORT=5009`)
- **Mode:** single-user (`--single-user`)
- **Auth:** `MCP_API_KEY` env var (via `GWS_MCP_API_KEY`)
- **Credentials:** Stored in Docker volume `google-workspace-mcp-creds`

### Local Usage (stdio)

```json
"google-workspace": {
  "command": "uv",
  "args": ["run", "main.py"],
  "cwd": "/Users/florian.scheugenpflug/Projekte/mail-zero-fork/tools/google-workspace-mcp",
  "env": {
    "GOOGLE_OAUTH_CLIENT_ID": "<your-client-id>",
    "GOOGLE_OAUTH_CLIENT_SECRET": "<your-client-secret>",
    "USER_GOOGLE_EMAIL": "florian.scheugenpflug@lair404.xyz"
  }
}
```

