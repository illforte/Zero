# mail-zero-fork — Claude Code Instructions

Fork of [Mail-0/Zero](https://github.com/Mail-0/Zero) — self-hosted AI email client, heavily customized for lair404 and n1njanode deployment.

- **Remote:** `weretradeIT/mail-zero-fork` (`git@github.com:weretradeIT/mail-zero-fork.git`)
- **Deployed:** lair404 (port 3050) and n1njanode (port 3050)
- **MCP server:** port 5008 (SSE transport, requires API key)

> **Key docs:** `LAIR404-NOTES.md` — 12 weretrade customizations in detail. `MCP.md` — MCP server tool list.

---

## Repository Structure

```
mail-zero-fork/
├── apps/
│   ├── mail/            Next.js frontend email client
│   └── server/          Backend API
├── packages/
│   ├── cli/             nizzy CLI tools
│   ├── db/              Drizzle ORM schemas
│   ├── eslint-config/   Shared ESLint
│   └── tsconfig/        Shared TS configs
├── tools/
│   ├── google-workspace-mcp/ Google Workspace MCP (Calendar, Drive, Docs, Sheets — port 5009)
│   ├── imap-proxy/      IMAP/SMTP proxy (→ local Dovecot/Postfix via 127.0.0.1)
│   ├── mail-server/     Backend server + AI WebSocket agent
│   └── mcp-mail-server/ MCP server implementation (port 5008)
├── docker/              Dockerfiles for all services
├── docker-compose.lair404.yaml    — lair404 production
├── docker-compose.n1njanode.yaml  — n1njanode production
├── deploy-lair404.sh    — Production deploy script (lair404)
└── deploy-n1njanode.sh  — Production deploy script (n1njanode)
```

---

## Tech Stack

pnpm monorepo (Turborepo). Node.js, Next.js (React 19), TypeScript, tRPC, Drizzle ORM, PostgreSQL, Better Auth, Cloudflare Access JWT.

GHCR image: `ghcr.io/lair404xyz/mail-zero:latest` (built and published by n1njanode-infrastructure CI)

---

## Development Commands

```bash
pnpm install          # Install all deps
pnpm dev              # Start all packages (Next.js + backend)
pnpm build            # Build all packages
pnpm test             # Run tests
pnpm db:generate      # Generate Drizzle migrations
pnpm db:push          # Push schema to PostgreSQL
```

> **Never run project-wide lint/format commands** — causes failures across packages.

---

## Key lair404 Customizations

See `LAIR404-NOTES.md` for full implementation details.

1. **Billing bypass** — Self-hosted subscription checks disabled
2. **tRPC POST fix** — Works through Cloudflare Access (GET→POST override)
3. **Same-origin backend URL** — Frontend calls `/api` (not separate domain) for CF Access compatibility
4. **Google email driver** — Custom Gmail integration
5. **Bundle patching** — Next.js bundle patches for self-hosted compatibility
6. **IMAP/SMTP via 127.0.0.1** — `imap-proxy` connects to local Dovecot/Postfix (NOT external IMAP servers)
7. **AI WebSocket agent** — `mail-server` has WebSocket-based AI chat agent
8. **CF Access redirect** — Login redirects preserved through CF Access SSO
9. **Per-connection IMAP credentials** — Stored in `accessToken`/`refreshToken` DB fields
10. **SMTP TLS** — Custom TLS config for local mail server
11. **Google Workspace MCP UI** — Nav menu drops down when Google linked
12. **OAuth Seamless Login & Loop Fix** — Mocked autumn endpoint and removed prompt consent

---

## Ports

| Port | Service |
|------|---------|
| 3050 | Frontend (Next.js) — both servers |
| 5434 | PostgreSQL DB |
| 5008 | MCP SSE server — email (`tools/mcp-mail-server/`) |
| 5009 | MCP streamable-http server — Google Workspace (`tools/google-workspace-mcp/`) |

---

## MCP Servers

### Email MCP (port 5008)

- **Transport:** SSE (`MCP_TRANSPORT=sse`) or stdio (local dev)
- **Auth:** `Authorization: Bearer {MCP_API_KEY}` or `X-Api-Key` header
- **User context:** `MAIL_ZERO_USER_EMAIL` env var
- **Capabilities:** email search, read, reply, spam/delete/archive, send, unsubscribe, label management, AI summarization

### Google Workspace MCP (port 5009)

- **Transport:** streamable-http (`--transport streamable-http`)
- **Auth:** `MCP_API_KEY` (via `GWS_MCP_API_KEY` env var)
- **Source:** vendored from `taylorwilsdon/google_workspace_mcp` in `tools/google-workspace-mcp/`
- **Capabilities:** Gmail, Calendar, Drive, Docs, Sheets, Slides, Tasks, Contacts, Forms, Chat, Apps Script, Google Search
- **Mode:** single-user (`--single-user` flag, credentials in Docker volume)

See `MCP.md` for complete tool lists.

---

## Deployment

```bash
# lair404
./deploy-lair404.sh

# n1njanode (build via lair404 buildx, deploy via n1njanode-infrastructure)
./deploy-n1njanode.sh
```

**Nginx:** `nginx-lair404.conf` — routes WebSocket, auth, tRPC, and frontend through Cloudflare Access.

**CF Access:** JWT validation at app level. Auth via Google OAuth (Better Auth). Redirect loop fix: same-origin backend URL (customization #3).

---

## Database

- **PostgreSQL** at `127.0.0.1:5434`
- **Valkey** (Redis-compatible) at internal docker network
- Vault credentials: `secret/lair404/mail-zero`
- Schema managed via Drizzle (`packages/db/schema.ts`)
- Per-connection IMAP credentials stored in `accessToken`/`refreshToken` fields (not env vars)

---

## Upstream Sync

- **Upstream:** `github.com/Mail-0/Zero`
- **Strategy:** Merge upstream, then verify all 12 customizations still intact (check `LAIR404-NOTES.md`)

---

## Cloud-Only Features (Stubbed)

These return empty responses on self-hosted: categories, Intercom, BIMI, brain features.

---

## Git

- Remote: `weretradeIT/mail-zero-fork`
- NEVER `git push --force` to main
- ALWAYS stage specific files, NEVER `git add .`
- Commit messages: HEREDOC format

---

**Version:** 1.0.1
**Updated:** 2026-04-10
