# GitHub Secrets Configuration Guide

## Required GitHub Secrets for AWS EC2 Deployment

To enable automated deployment via GitHub Actions, configure these secrets in your GitHub repository:

**Settings → Secrets and variables → Actions → New repository secret**

### Essential Secrets:

1. **`AWS_EC2_HOST`**
   ```
   Value: 3.108.163.45
   Description: AWS EC2 server IP address
   ```

2. **`AWS_EC2_USER`**
   ```
   Value: ubuntu
   Description: SSH username for EC2 instance
   ```

3. **`AWS_EC2_SSH_KEY`**
   ```
   Value: [Full contents of your PEM file]
   Format: Copy entire content of zebrank.pem file
   Important: Include -----BEGIN RSA PRIVATE KEY----- and -----END RSA PRIVATE KEY----- lines
   ```

4. **`AUTH_SECRET`**
   ```
   Value: [Your application auth secret]
   Description: NextAuth.js secret for session encryption
   Generate: openssl rand -base64 32
   ```

5. **`AUTH_GOOGLE_ID`**
   ```
   Value: [Google OAuth Client ID]
   Description: Google OAuth client ID for authentication
   ```

6. **`AUTH_GOOGLE_SECRET`**
   ```
   Value: [Google OAuth Client Secret]
   Description: Google OAuth client secret for authentication
   ```

### Optional Secrets (for other workflows):

7. **`DEVELOPMENT_SSH_KEY`** - SSH key for development server (if using)
8. **`DEVELOPMENT_DATABASE_URL`** - Development database connection string
9. **`SLACK_WEBHOOK_URL`** - For Slack notifications (optional)

## How to Configure:

1. Go to your repository on GitHub: `https://github.com/openvtsofficial/openvts-app-builder`
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Enter secret name and value
5. Click **Add secret**

## Verification Steps:

1. **Test deployment manually**:
   ```bash
   cd /opt/studio
   docker-compose -f docker-compose.studio.yml pull
   docker-compose -f docker-compose.studio.yml up -d
   ```

2. **Verify application**:
   - Direct access: https://studio.openvts.io
   - Health check: https://studio.openvts.io/api/health

3. **Test GitHub Actions**:
   - Go to repository → Actions tab
   - Select "AWS EC2 Deployment" workflow
   - Click "Run workflow" → "Run workflow"

## Current Infrastructure Status:

✅ **Application**: Running on port 8082 in Docker container  
✅ **Database**: PostgreSQL database configured (`openvts_app_studio`)  
✅ **SSL Certificate**: Let's Encrypt certificate installed (valid until 2026-10-29)  
✅ **Nginx**: Configured with HTTP→HTTPS redirect  
✅ **Auto-renewal**: Certbot configured for automatic SSL renewal  
✅ **GitHub Actions**: CI/CD workflows created and pushed  
✅ **Docker Build**: Fixed templates extraction issue  

## Next Steps:

1. **Configure GitHub Secrets** as listed above
2. **Test GitHub Actions workflow** with a test commit
3. **Monitor SSL certificate** renewal (auto-configured by certbot)
4. **Check CloudFlare DNS** - Ensure proxy is disabled for direct SSL termination

## Troubleshooting:

- **SSL Issues**: Check `/var/log/letsencrypt/letsencrypt.log`
- **Deployment Issues**: Check GitHub Actions logs
- **Application Issues**: Check Docker logs: `docker logs studio-openvts`
- **Database Issues**: Verify connection: `docker exec studio-openvts npx prisma migrate status`

## Security Notes:

- GitHub Secrets are encrypted and never exposed in logs
- SSH keys should have strict permissions (600)
- Regular security updates via GitHub Actions workflows
- SSL certificates auto-renew every 90 days