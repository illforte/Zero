#!/bin/bash
set -e
echo "🔐 Authenticating with GHCR..."
GITHUB_TOKEN="${LAIR404XYZ_GITHUB_PAT:-$(gh auth token)}"
echo "$GITHUB_TOKEN" | docker login ghcr.io -u lair404xyz --password-stdin
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

echo "📦 Building mail-zero frontend image..."
docker buildx build --progress=plain --platform linux/amd64 --file docker/app/Dockerfile --tag ghcr.io/lair404xyz/mail-zero:latest --tag "ghcr.io/lair404xyz/mail-zero:${TIMESTAMP}" --push .

echo "📦 Building mail-zero-imap-proxy image..."
docker buildx build --progress=plain --platform linux/amd64 --file tools/imap-proxy/Dockerfile --tag ghcr.io/lair404xyz/mail-zero-imap-proxy:latest --tag "ghcr.io/lair404xyz/mail-zero-imap-proxy:${TIMESTAMP}" --push tools/imap-proxy
