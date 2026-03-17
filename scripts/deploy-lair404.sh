#!/bin/bash
set -e

# Mail-Zero Deployment Script for lair404
# Deploys the mail-zero stack to lair404.xyz server

LAIR404_HOST="lair404"
DEPLOY_DIR="/opt/weretrade/mail-zero"

echo "🚀 Deploying mail-zero to lair404..."

# Step 1: Copy deployment files to lair404
echo "📤 Uploading deployment files..."
ssh $LAIR404_HOST "mkdir -p $DEPLOY_DIR"

scp docker-compose.lair404.yaml $LAIR404_HOST:$DEPLOY_DIR/docker-compose.yml
scp .env.lair404 $LAIR404_HOST:$DEPLOY_DIR/.env

# Step 2: Pull latest image on lair404
echo "📥 Pulling latest Docker image on lair404..."
ssh $LAIR404_HOST "cd $DEPLOY_DIR && docker compose pull"

# Step 3: Deploy/Update the stack
echo "🔄 Deploying mail-zero stack..."
ssh $LAIR404_HOST "cd $DEPLOY_DIR && docker compose up -d --force-recreate"

# Step 4: Check health
echo "🏥 Checking service health..."
sleep 10
ssh $LAIR404_HOST "cd $DEPLOY_DIR && docker compose ps"

echo "✅ Deployment complete!"
echo "📍 Service running on lair404:3050"
echo "🌐 Access via: https://mail.lair404.xyz (after nginx config)"
