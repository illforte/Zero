# Mail-Zero Deployment to lair404

Complete deployment guide for self-hosting mail-zero on lair404.xyz with Docker, Cloudflare Access SSO, and app launcher integration.

## Prerequisites

- lair404.xyz server access (SSH root)
- GitHub Container Registry access (GHCR)
- Cloudflare account with Access/WARP enabled
- Domain: `mail.lair404.xyz` (DNS pointing to lair404)

## Port Assignment

- **Service Port**: 3050 (web category)
- **Binding**: 127.0.0.1:3050 (internal only, nginx proxy)
- **Database Port**: 5434 (127.0.0.1:5434, PostgreSQL)

## Deployment Steps

### 1. Environment Setup

Create `.env.lair404` with actual credentials:

```bash
cp .env.lair404.example .env.lair404
# Edit .env.lair404 with secure passwords and API keys
```

**Required secrets (from Vault):**
- `POSTGRES_PASSWORD` - Generate secure password
- `REDIS_TOKEN` - Generate secure token
- `GROQ_API_KEY`, `OPENAI_API_KEY`, etc. - From Vault `secret/lair404/mail-zero`

### 2. Build Docker Image

```bash
./build-lair404.sh
```

This builds the AMD64 image and pushes to GHCR.

### 3. Deploy to lair404

```bash
./deploy-lair404.sh
```

This:
- Uploads docker-compose.yml and .env to `/opt/weretrade/mail-zero`
- Pulls the image
- Starts the stack
- Checks health

### 4. Configure Nginx

```bash
# On lair404
sudo cp nginx-lair404.conf /etc/nginx/sites-available/mail.lair404.xyz
sudo ln -s /etc/nginx/sites-available/mail.lair404.xyz /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 5. Set up Cloudflare Access (SSO)

#### A. Create Access Application

1. Go to Cloudflare Zero Trust → Access → Applications
2. Add application:
   - **Name**: Mail-Zero
   - **Application domain**: `mail.lair404.xyz`
   - **Session duration**: 24 hours

#### B. Configure Authentication

**Option 1: OIDC (Recommended - like LiteLLM)**
1. Identity providers → Add Google OAuth or similar
2. Create policy:
   - **Name**: Mail-Zero Access
   - **Action**: Allow
   - **Include**: Emails ending in `@lair404.xyz` or specific emails

**Option 2: One-Time PIN**
- Allow via email verification
- Emails: Your authorized list

#### C. Download JWT Certificate

```bash
# On lair404
curl -s https://mail.lair404.xyz/cdn-cgi/access/certs > /etc/nginx/cloudflare-access-certs/mail.lair404.xyz.crt
```

#### D. Enable JWT validation in nginx

Uncomment these lines in `nginx-lair404.conf`:
```nginx
auth_jwt $http_cf_authorization;
auth_jwt_key_file /etc/nginx/cloudflare-access-certs/mail.lair404.xyz.crt;
```

Reload nginx:
```bash
sudo nginx -t && sudo systemctl reload nginx
```

### 6. Register Port

```bash
# Via MCP or manually add to port registry
ssh root@lair404.xyz
docker exec port-registry node cli.js register 3050 mail-zero "Mail-Zero email client" web
```

### 7. Add to App Launcher

Add tile to weretrade app launcher (internal apps):

```typescript
// In your app launcher config
{
  name: 'Mail-Zero',
  description: 'Email client with AI assistance',
  url: 'https://mail.lair404.xyz',
  icon: '📧',
  category: 'Communication',
  requiresAuth: true
}
```

## Security Checklist

- [ ] Port binding: 127.0.0.1:3050 (NOT 0.0.0.0)
- [ ] Database credentials in Vault + MCP
- [ ] Cloudflare Access SSO enabled
- [ ] Nginx JWT validation active
- [ ] Port registered in registry
- [ ] TLS certificate valid (Let's Encrypt)
- [ ] Health check accessible at `/health`
- [ ] Docker volumes backed up

## Verification

```bash
# Test health endpoint (should work without auth)
curl https://mail.lair404.xyz/health

# Test app access (should redirect to CF Access login)
curl -I https://mail.lair404.xyz

# Check Docker logs
ssh root@lair404.xyz "cd /opt/weretrade/mail-zero && docker compose logs -f --tail=50"

# Check service status
ssh root@lair404.xyz "cd /opt/weretrade/mail-zero && docker compose ps"
```

## Backup & Maintenance

### Backup Database

```bash
ssh root@lair404.xyz "docker exec mail-zero-db pg_dump -U mailzero mailzero > /backup/mail-zero-$(date +%Y%m%d).sql"
```

### Update Image

```bash
# Rebuild and push
./build-lair404.sh

# Deploy update
./deploy-lair404.sh
```

### Logs

```bash
# View logs
ssh root@lair404.xyz "cd /opt/weretrade/mail-zero && docker compose logs -f mail-zero"

# Check nginx logs
ssh root@lair404.xyz "tail -f /var/log/nginx/mail.lair404.xyz.access.log"
```

## Troubleshooting

### Service won't start

```bash
# Check logs
docker compose logs mail-zero

# Check environment variables
docker compose config

# Verify database connection
docker compose exec mail-zero-db psql -U mailzero -d mailzero -c "SELECT 1"
```

### Cloudflare Access not working

- Verify DNS points to lair404 IP
- Check CF Access application configuration
- Ensure JWT certificate is up to date
- Test nginx JWT module: `nginx -V 2>&1 | grep jwt`

### Database migrations failed

```bash
# Run migrations manually
docker compose up mail-zero-migrations
```

## URLs

- **Production**: https://mail.lair404.xyz
- **Health**: https://mail.lair404.xyz/health
- **CF Access Dashboard**: https://one.dash.cloudflare.com/

---

**Deployed**: [Date]
**Version**: v1.0.0
**Maintainer**: lair404 team
