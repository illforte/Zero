# mail-zero — lair404.xyz Deployment Notes

This file documents all customizations and fixes applied to make the upstream
[mail-zero](https://github.com/Mail-0/Zero) work in the lair404.xyz self-hosted setup.

---

## Architecture

```
mail.lair404.xyz (nginx, port 3050 frontend + proxy /api/ /trpc/ → 3051)
├── mail-zero          (frontend, port 127.0.0.1:3050)  [bridge: mail-zero-net]
├── mail-zero-server   (backend,  port 3051)             [network_mode: host]
├── mail-zero-imap-proxy (IMAP/SMTP proxy, port 3060)   [network_mode: host]
├── mail-zero-db       (PostgreSQL, port 127.0.0.1:5436) [bridge: mail-zero-net]
├── mail-zero-valkey   (Redis-compat, internal)          [bridge: mail-zero-net]
└── mail-zero-upstash-proxy (Redis HTTP proxy, internal) [bridge: mail-zero-net]
```

Authentication: Cloudflare Access (JWT header `CF-Access-JWT-Assertion`) + Better Auth sessions.
Mail backend: n1njanode.com (Postfix/Dovecot, ports 465 SMTPS, 993 IMAPS).

---

## Customizations in This Fork

### 1. Billing Bypass (`apps/mail/components/connection/add.tsx`)

Upstream limits free tier to 1 email connection. Self-hosted has no billing.

**Fix:** Hardcoded `canCreateConnection = true` instead of checking `useBilling()`.

```typescript
// Before
const { canCreateConnection, attach } = useBilling();

// After — self-hosted: no billing limits
const { attach } = useBilling();
const canCreateConnection = true;
```

Commit: `fix(billing): bypass connection limit for self-hosted instance`

---

### 2. tRPC POST Batch Fix (`tools/mail-server/src/index.ts`)

tRPC v11 with `@hono/trpc-server` rejects `POST` requests for query procedures by default.
The browser's `httpBatchLink` sends `POST /trpc/endpoint?batch=1` — returns `405 METHOD_NOT_SUPPORTED`.

**Fix:** Added `allowMethodOverride: true` to `trpcConfig`:

```typescript
const trpcConfig = {
  router: appRouter,
  allowMethodOverride: true, // allow POST for query procedures (tRPC v11 httpBatchLink sends POST)
  createContext: ...
};
```

Commit: `fix(trpc): allow POST for query procedures (allowMethodOverride: true)`

---

### 3. Same-Origin Backend URL (`docker-compose.lair404.yaml`)

Upstream uses a separate `mail-api.lair404.xyz` domain for the backend API.
In our setup both frontend and API are served from `mail.lair404.xyz` (nginx proxies
`/api/` and `/trpc/` to port 3051). Using a separate domain required a second
Cloudflare Access cookie — cross-origin auth fails.

**Fix:** Set all backend URL env vars to `https://mail.lair404.xyz`:

```yaml
VITE_PUBLIC_BACKEND_URL: https://mail.lair404.xyz
BETTER_AUTH_URL: https://mail.lair404.xyz   # was: https://mail-api.lair404.xyz
CORS_ORIGINS: https://mail.lair404.xyz
APP_URL: https://mail.lair404.xyz
```

Also added catch-all in `fix-bundle.js` (see below) to replace any hardcoded
`mail-api.lair404.xyz` references remaining in the built JS bundle.

Commit: `fix(mail): set BETTER_AUTH_URL to mail.lair404.xyz (same-origin)`

---

### 4. Google Driver (`tools/mail-server/src/driver/google.ts`)

Added a complete Google Gmail driver (ported from the upstream `apps/server` package)
to support Gmail connections via the node-based mail-zero-server.

**Key fix — `he` import:** The `he` npm package is CommonJS. Using
`import * as he from 'he'` puts exports at `he.default`, not `he.decode`.
This caused `TypeError: he.decode is not a function` on every email open.

```typescript
// WRONG — namespace import of CJS module
import * as he from 'he';

// CORRECT — default import resolves to the CJS exports
import he from 'he';
```

Commit: `fix(google-driver): use default import for 'he' CJS module`

---

### 5. fix-bundle.js (`tools/mail-zero/fix-bundle.js`)

A script bind-mounted into the `mail-zero` frontend container at startup.
Patches the built JS files before serving:

1. Replace `http://REPLACE-BACKEND-URL.com` → `https://mail.lair404.xyz`
2. Replace `host:void 0` (WebSocket host undefined) → `host:"mail.lair404.xyz"`
3. Replace `host:"undefined"` string literal → `host:"mail.lair404.xyz"`
4. **Catch-all:** Replace any remaining `mail-api.lair404.xyz` → `mail.lair404.xyz`
5. Remove cloud-only sidebar items (Live Support, Feedback links)
6. Adjust panel layout: sidebar 24%→20%, thread list 35%→42%

Commit: `fix(mail-zero): add catch-all replace for mail-api.lair404.xyz in fix-bundle`

---

### 6. SMTP/IMAP URL — Use lair404 docker-mailserver via 127.0.0.1

**Mail server:** lair404 runs `docker-mailserver` (ghcr.io/docker-mailserver/docker-mailserver)
at `mail.lair404.xyz`, with all `@lair404.xyz` accounts configured.

**Why `127.0.0.1` not `mail.lair404.xyz`:**
`mail.lair404.xyz` is proxied through Cloudflare (188.114.96.3/97.3) which does
NOT forward IMAP/SMTP ports. Since `mail-zero-imap-proxy` uses `network_mode: host`,
it can reach the mailserver directly on `127.0.0.1:993/465`.

```
# In /opt/weretrade/mail-zero/.env on lair404 (gitignored):
SMTP_URL=smtps://mail%40lair404.xyz:PASSWORD@127.0.0.1:465
IMAP_URL=imaps://mail%40lair404.xyz:PASSWORD@127.0.0.1:993
```

**Important:** Do NOT use `mail.lair404.xyz` — Cloudflare proxies that DNS record.
Use `127.0.0.1` (host network) to reach the `mailserver` container directly.

### 7. AI Agent — WebSocket to LiteLLM Proxy (`tools/mail-server/src/index.ts`)

The upstream AI agent uses Cloudflare Durable Objects (not available in self-hosted mode).
Replaced with a Node.js WebSocket server that speaks the `cf_agent` protocol and routes to
the lair404 LiteLLM proxy.

**Backend changes:**
```typescript
// Removed: app.all('/agents/*', 501 stub)
// Added: Node.js 'upgrade' event handler + ws WebSocket server
// cf_agent_use_chat_request → streamText via LiteLLM proxy
```

**nginx** (`/etc/nginx/sites-available/mail.lair404.xyz`):
Added before the catch-all `location /`:
```nginx
location /agents/ {
    proxy_pass http://127.0.0.1:3051;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 3600;
}
```

**Env vars** (in `/opt/weretrade/mail-zero/.env` on lair404):
```
LITELLM_BASE_URL=http://127.0.0.1:4000/v1
LITELLM_VIRTUAL_KEY=sk-CPBfWiJGe8qOt1HGGGWpeqA  (mail-zero-ai-agent key, $20/30d budget)
LITELLM_MODEL=mistral-large
```

LiteLLM virtual key: `mail-zero-ai-agent` — created 2026-02-21 with mistral-large access.

Commit: `feat(server): WebSocket AI agent with LiteLLM proxy`

---

### 8. IMAP `get()` missing `latest` field (`tools/mail-server/src/driver/imap.ts`)

Zero's `Thread` component renders `null` when `getThreadData?.latest` is `undefined`
(`mail-list.tsx:215: if (!latestMessage || !getThreadData) return null`).
The Google driver sets `latest` = most recent message; IMAP driver was missing it.

**Fix:** Extract the single message into a variable and return it as `latest`:

```typescript
const message = { id, threadId: id, subject, sender, ... };
return {
  messages: [message],
  latest: message,  // ← added
  hasUnread: true,
  ...
};
```

Commit: `fix(imap-driver): return latest message in get() so Thread component renders`

---

### 9. CF Access auth redirect URL fix (`tools/mail-server/src/routes/cf-access-auth.ts`)

The callback redirected to `/${connectionId}/mail/inbox` but Zero's routes have no
`connectionId` URL segment — that URL hits the `/*` catch-all → 404 page on first login.

**Fix:** Redirect to `/mail/inbox` (no connectionId prefix):

```typescript
return c.redirect(`${env.APP_URL}/mail/inbox`);
```

Commit: `fix(cf-access-auth): redirect to /mail/inbox (not /{connectionId}/mail/inbox)`

---

### Per-Connection IMAP Credentials

**Fixed.** `ImapMailManager` now reads IMAP/SMTP URLs from the connection's `accessToken`/`refreshToken`
fields (stored in DB), falling back to `env.IMAP_URL`/`env.SMTP_URL` when the field is a placeholder.

**DB field convention:**
- `accessToken` = full IMAP URL, e.g. `imaps://user%40domain.com:password@127.0.0.1:993`
- `refreshToken` = full SMTP URL, e.g. `smtps://user%40domain.com:password@127.0.0.1:465`
- Value `imap-placeholder` = no per-connection credentials → falls back to global env var

**Set credentials per connection via tRPC:**
```bash
# From lair404, using a session cookie:
curl -s -X POST https://mail.lair404.xyz/trpc/connections.updateImapCredentials \
  -H "Content-Type: application/json" \
  -H "Cookie: __Secure-better-auth.session_token=TOKEN" \
  -d '{"json":{"connectionId":"CONNECTION-ID","imapUrl":"imaps://admin%40lair404.xyz:PASSWORD@127.0.0.1:993","smtpUrl":"smtps://admin%40lair404.xyz:PASSWORD@127.0.0.1:465"}}'
```

**Or directly via SQL on lair404:**
```sql
UPDATE mail0_connection
SET access_token = 'imaps://admin%40lair404.xyz:PASSWORD@127.0.0.1:993',
    refresh_token = 'smtps://admin%40lair404.xyz:PASSWORD@127.0.0.1:465',
    updated_at = NOW()
WHERE email = 'admin@lair404.xyz' AND provider_id = 'imap';
```

**Current state (2026-02-21):**
- `mail@lair404.xyz` — real IMAP/SMTP URLs stored (shows own inbox ✅)
- `admin@`, `support@`, `alerts@`, `contact@`, `hello@`, `info@`, `masterspl1nter@`, `reporting@` — placeholder (shows mail@lair404.xyz inbox as fallback)

To give each additional account its own inbox, set its IMAP/SMTP URL via SQL using the account's password from the docker-mailserver on n1njanode.

---

### 10. SMTP TLS fix (`tools/imap-proxy/src/index.ts`)

All IMAP connections in imap-proxy had `tlsOptions: { rejectUnauthorized: false }`,
but the SMTP `/api/smtp/send` nodemailer transport was missing it. Connecting to
`127.0.0.1:465` with a hostname cert causes `ERR_TLS_CERT_ALTNAME_INVALID`.

**Fix:** Added `tls: { rejectUnauthorized: false }` to the nodemailer transport:

```typescript
const transporter = nodemailer.createTransport({
  host: emailData.smtp.host,
  port: emailData.smtp.port,
  secure: emailData.smtp.secure,
  auth: { user: emailData.smtp.user, pass: emailData.smtp.password },
  tls: { rejectUnauthorized: false },  // ← added
});
```

Commit: `fix(imap-proxy): add rejectUnauthorized:false to SMTP nodemailer transport`

---

## nginx Config (`nginx-lair404.conf`)

Routes for `mail.lair404.xyz`:
- `/agents/` → upstream port 3051 (WebSocket proxy, `Upgrade`/`Connection` headers)
- `GET/POST /api/auth/**` → upstream port 3051 (Better Auth)
- `POST /api/trpc/**` → rewrite to `/trpc/$1` → upstream port 3051
- `GET /trpc/**` → upstream port 3051
- Everything else → frontend port 3050

Cookie auth check: `__Secure-better-auth.session_token` regex in `map` block.

### tRPC stubs (cloud-only procedures, return empty/null):

| Procedure | Returns |
|-----------|---------|
| `categories.defaults` | `[]` |
| `user.getIntercomToken` | `null` |
| `bimi.getByEmail` | `null` |
| `mail.suggestRecipients` | `[]` |
| `brain.getPrompts` | `[]` |
| `brain.generateSummary` | `null` |
| `ai.webSearch` | `[]` |

---

## Container Images

| Service | Image |
|---------|-------|
| Frontend | `ghcr.io/lair404xyz/mail-zero:latest` |
| Backend | `ghcr.io/lair404xyz/mail-zero-server-node:latest` |
| IMAP Proxy | `ghcr.io/lair404xyz/mail-zero-imap-proxy:latest` |

All images built with `docker buildx build --platform linux/amd64` (lair404 is AMD64).

---

## Known Non-Issues

- **mail@lair404.xyz shows empty inbox**: IMAP login works, inbox simply has no emails
  yet. Send test mail to confirm it appears.
- **`/monitoring/sentry` CORS errors**: Sentry SDK present but no DSN configured.
  Harmless, no impact on functionality.
- **n1njanode self-signed cert**: `rejectUnauthorized: false` is already set in
  imap-proxy — self-signed cert silently accepted for IMAP/SMTP.


---

### 11. Google Workspace MCP Integration & UI Polishing

Added conditional rendering in the `NavUser` dropdown component (`apps/mail/components/ui/nav-user.tsx`) to display direct links to Google Workspace services (Gmail, Drive, Calendar, Docs, Sheets, Slides) exclusively when a Google Account is active.

This enhances the user experience by bringing all Google productivity tools into a unified dropdown. Testing via E2E confirmed the Google Workspace MCP connects properly, searches files, reads calendar events, and operates successfully alongside the LiteLLM proxy which acts as the core router.
