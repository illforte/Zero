#!/bin/bash
set -e

# Mail-Zero Docker Build Script for lair404
# Platform: linux/amd64 (lair404 is AMD64, Mac is ARM)

echo "🏗️  Building mail-zero Docker image for lair404..."

# GHCR authentication
echo "🔐 Authenticating with GHCR..."
gh auth token | docker login ghcr.io -u illforte --password-stdin

# Build for AMD64 platform
echo "📦 Building Docker image (platform: linux/amd64)..."
docker buildx build \
  --platform linux/amd64 \
  --file docker/app/Dockerfile \
  --tag ghcr.io/illforte/mail-zero:latest \
  --tag ghcr.io/illforte/mail-zero:$(date +%Y%m%d-%H%M%S) \
  --push \
  .

echo "✅ Build complete!"
echo "📦 Image: ghcr.io/illforte/mail-zero:latest"
