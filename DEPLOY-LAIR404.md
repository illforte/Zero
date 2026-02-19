# Lair404 Self-Hosted Deployment

## Docker Images

| Service | Image | Source |
|---|---|---|
| Frontend | `ghcr.io/lair404xyz/mail-zero:server-bun` | This repo `lair404-clean` branch |
| Backend server | `ghcr.io/lair404xyz/mail-zero-server-node:latest` | This repo `lair404-clean` branch |
| IMAP proxy | `ghcr.io/lair404xyz/mail-zero-imap-proxy:latest` | `packages/imap-proxy/` |

## Build Commands

### IMAP Proxy
```bash
cd packages/imap-proxy
docker buildx build --platform linux/amd64 \
  -t ghcr.io/lair404xyz/mail-zero-imap-proxy:latest \
  --push .
```

### Backend Server (apps/server with IMAP driver)
```bash
docker buildx build --platform linux/amd64 \
  -f docker/server/Dockerfile \
  -t ghcr.io/lair404xyz/mail-zero-server-node:latest \
  --push .
```

### Frontend (apps/mail)
```bash
docker buildx build --platform linux/amd64 \
  -f docker/app/Dockerfile \
  -t ghcr.io/lair404xyz/mail-zero:server-bun \
  --push .
```

## Runtime Patches (applied at container startup)

The `fix-*.js` scripts in `tools/mail-zero/` patch compiled output on startup.
These are fallback patches — the TypeScript sources in this repo should already
include all fixes. Patches exist for forward-compatibility only.

## Deployment

See `tools/mail-zero/docker-compose.lair404.yaml` in `illforte/weretradeInfantrie_1.0`.
