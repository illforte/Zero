# Cloudflare Access SSO Setup for Mail-Zero

Step-by-step guide to configure Cloudflare Access with OIDC SSO for mail.lair404.xyz (matching LiteLLM configuration).

## Prerequisites

- Cloudflare Zero Trust account
- Domain: `mail.lair404.xyz` (DNS → lair404 IP)
- Google Workspace or identity provider for OIDC

## Step 1: Create Access Application

1. Navigate to **Cloudflare Zero Trust** → **Access** → **Applications**
2. Click **Add an application** → **Self-hosted**

### Application Configuration

```yaml
Name: Mail-Zero
Application Domain: mail.lair404.xyz
Session Duration: 24 hours
Enable automatic cloudflared authentication: No
```

### Identity Provider (Same as LiteLLM)

**Option A: Google Workspace OIDC**

1. Go to **Settings** → **Authentication** → **Identity providers**
2. Add **Google Workspace** (if not already configured)
3. Use existing credentials:
   - Client ID: (from `CF_ACCESS_LITELLM_OIDC_CLIENT_ID`)
   - Client Secret: (from `CF_ACCESS_LITELLM_OIDC_CLIENT_SECRET`)

**Option B: Use Email OTP**
- Allow: Emails ending in `@lair404.xyz`
- Or specific email addresses

## Step 2: Create Access Policy

### Policy Name: Mail-Zero Access

**Include Rule:**
```yaml
Selector: Emails
Value: florian@lair404.xyz (or @lair404.xyz for domain)
```

Or reuse existing LiteLLM groups if configured.

### Policy Settings
```yaml
Decision: Allow
Session duration: Same as application (24h)
Purpose: Access to Mail-Zero email client
```

## Step 3: Application Settings

### Additional Settings

**Cookies:**
```yaml
Same-Site Attribute: None
HTTP Only: true
Binding Cookie: true
```

**CORS:**
```yaml
Allow all origins: No
Allowed origins:
  - https://mail.lair404.xyz
Allowed methods: GET, POST, PUT, DELETE, OPTIONS
Allow credentials: true
```

**Skip authentication:**
```yaml
/health
```

## Step 4: Download JWT Certificate

```bash
# On lair404
sudo mkdir -p /etc/nginx/cloudflare-access-certs
curl -s https://mail.lair404.xyz/cdn-cgi/access/certs > /etc/nginx/cloudflare-access-certs/mail.lair404.xyz.crt
```

## Step 5: Enable JWT Validation in Nginx

Edit `/etc/nginx/sites-available/mail.lair404.xyz`:

```nginx
# Uncomment these lines
auth_jwt $http_cf_authorization;
auth_jwt_key_file /etc/nginx/cloudflare-access-certs/mail.lair404.xyz.crt;
```

Reload nginx:
```bash
sudo nginx -t && sudo systemctl reload nginx
```

## Step 6: Test Access

1. Open: https://mail.lair404.xyz
2. Should redirect to Cloudflare Access login
3. After authentication → redirected to mail-zero app
4. Headers passed to app:
   - `CF-Access-JWT-Assertion`
   - `CF-Access-Email`
   - `CF-Access-User`

## Verification Checklist

- [ ] Access application created
- [ ] OIDC provider configured
- [ ] Access policy allows your email
- [ ] JWT certificate downloaded
- [ ] Nginx JWT validation enabled
- [ ] Health endpoint bypasses auth (`/health`)
- [ ] Test login successful
- [ ] User email visible in app

## Troubleshooting

### "Access Denied"
- Check policy includes your email
- Verify identity provider is configured
- Check application domain matches exactly

### "502 Bad Gateway"
- Verify mail-zero container is running: `docker ps | grep mail-zero`
- Check nginx logs: `tail -f /var/log/nginx/mail.lair404.xyz.error.log`
- Test container directly: `curl http://127.0.0.1:3050/health`

### JWT Validation Fails
- Re-download certificate (may have rotated)
- Check nginx has `ngx_http_auth_jwt_module`: `nginx -V 2>&1 | grep jwt`
- Verify certificate path in nginx config

## Matching LiteLLM Configuration

Mail-Zero uses the **same** setup as LiteLLM:
- Same OIDC provider (Google Workspace)
- Same authentication flow
- Same session duration
- Same cookie settings
- Same JWT validation pattern

**Key Difference:** Mail-Zero is a full web app, LiteLLM is API-focused. Both use CF Access for authentication.

---

**Reference:** Similar to litellm.lair404.xyz configuration
**Documentation:** https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/
