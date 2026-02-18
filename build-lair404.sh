#!/bin/bash
set -e

# Mail-Zero Docker Build Script for lair404
# Platform: linux/amd64 (lair404 is AMD64, Mac is ARM)

echo "🏗️  Building mail-zero Docker images for lair404..."

# GHCR authentication (using lair404xyz organization with PAT)
echo "🔐 Authenticating with GHCR..."
GITHUB_TOKEN="${LAIR404XYZ_GITHUB_PAT:-$(gh auth token)}"
echo "$GITHUB_TOKEN" | docker login ghcr.io -u lair404xyz --password-stdin

TIMESTAMP=$(date +%Y%m%d-%H%M%S)

# Build frontend (static file server)
echo "📦 Building mail-zero frontend image..."
docker buildx build \
  --platform linux/amd64 \
  --file docker/app/Dockerfile \
  --tag ghcr.io/lair404xyz/mail-zero:latest \
  --tag "ghcr.io/lair404xyz/mail-zero:${TIMESTAMP}" \
  --push \
  .

# Build IMAP proxy (sequential — macOS fork exhaustion with parallel builds)
echo "📦 Building mail-zero-imap-proxy image..."
docker buildx build \
  --platform linux/amd64 \
  --file tools/imap-proxy/Dockerfile \
  --tag ghcr.io/lair404xyz/mail-zero-imap-proxy:latest \
  --tag "ghcr.io/lair404xyz/mail-zero-imap-proxy:${TIMESTAMP}" \
  --push \
  tools/imap-proxy

# Build Node.js backend server
echo "📦 Building mail-zero-server-node image..."
docker buildx build \
  --platform linux/amd64 \
  --file tools/mail-server/Dockerfile \
  --tag ghcr.io/lair404xyz/mail-zero-server-node:latest \
  --tag "ghcr.io/lair404xyz/mail-zero-server-node:${TIMESTAMP}" \
  --push \
  tools/mail-server

echo ""
echo "✅ All builds complete!"
echo "   ghcr.io/lair404xyz/mail-zero:latest"
echo "   ghcr.io/lair404xyz/mail-zero-imap-proxy:latest"
echo "   ghcr.io/lair404xyz/mail-zero-server-node:latest"
