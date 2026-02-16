#!/bin/bash
set -e

# Mail-Zero Docker Build Script for lair404
# Platform: linux/amd64 (lair404 is AMD64, Mac is ARM)

echo "🏗️  Building mail-zero Docker image for lair404..."

# GHCR authentication (using lair404xyz organization with PAT)
echo "🔐 Authenticating with GHCR..."
# Get token from MCP credentials or environment variable
GITHUB_TOKEN="${LAIR404XYZ_GITHUB_PAT:-$(gh auth token)}"
echo "$GITHUB_TOKEN" | docker login ghcr.io -u lair404xyz --password-stdin

# Build for AMD64 platform
echo "📦 Building Docker image (platform: linux/amd64)..."
docker buildx build \
  --platform linux/amd64 \
  --file docker/app/Dockerfile \
  --tag ghcr.io/lair404xyz/mail-zero:latest \
  --tag ghcr.io/lair404xyz/mail-zero:$(date +%Y%m%d-%H%M%S) \
  --push \
  .

echo "✅ Build complete!"
echo "📦 Image: ghcr.io/lair404xyz/mail-zero:latest"
