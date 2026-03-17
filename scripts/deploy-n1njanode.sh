# Deploy to n1njanode via lair404 bridge
LAIR404="lair404"
N1NJANODE="root@94.249.197.121"
DEPLOY_DIR="/opt/weretrade/mail-zero"

echo "🚀 Deploying mail-zero to n1njanode via lair404 bridge..."

# Step 1: Copy to lair404 first
echo "📤 Uploading to lair404 bridge..."
scp docker-compose.n1njanode.yaml $LAIR404:/tmp/docker-compose.n1njanode.yml
scp .env.n1njanode $LAIR404:/tmp/.env.n1njanode

# Step 2: Copy from lair404 to n1njanode
echo "📤 Moving from lair404 to n1njanode..."
ssh $LAIR404 "ssh $N1NJANODE 'mkdir -p $DEPLOY_DIR'"
ssh $LAIR404 "scp /tmp/docker-compose.n1njanode.yml $N1NJANODE:$DEPLOY_DIR/docker-compose.yml"
ssh $LAIR404 "scp /tmp/.env.n1njanode $N1NJANODE:$DEPLOY_DIR/.env"

# Step 3: Pull and deploy on n1njanode
echo "📥 Pulling and deploying on n1njanode..."
ssh $LAIR404 "ssh $N1NJANODE 'cd $DEPLOY_DIR && docker compose pull && docker compose up -d --force-recreate'"

# Step 4: Verify health
echo "🏥 Checking health on n1njanode..."
ssh $LAIR404 "ssh $N1NJANODE 'cd $DEPLOY_DIR && docker compose ps'"

echo "✅ Deployment to n1njanode complete!"
