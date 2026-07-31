# Deployment Plan: OpenVTS App Builder → `studio.openvts.io`

## Server Context

| Existing Service | URL | Method |
|-----------------|-----|--------|
| Website | openvts.io | Docker → port 3000 → Nginx :80 |
| CRM | crm.openvts.io | Docker (PHP) |
| Mautic | mautic.openvts.io | Docker |
| n8n Agent | agent.openvts.io | Docker |
| PostgreSQL | — | Shared DB (used by n8n + website) |

**New deployment:** `studio.openvts.io` → Docker container on port **8082** → Nginx reverse proxy

---

## Constraints

- DO NOT touch, restart, or modify any existing running containers
- DO NOT install a new PostgreSQL instance — reuse the existing one
- DO NOT reinstall Node, Nginx, or Docker on the host
- **Port 3000 is ALREADY IN USE** by the existing `openvts.io` website — NEVER use port 3000 for this application
- This application MUST run on port **8082** (both inside and outside the container)
- Nginx proxies `studio.openvts.io` → `localhost:8082`

---

## Step 1: DNS Configuration

Point `studio.openvts.io` to the server's public IP via an **A record** in your DNS provider.

```
studio.openvts.io  →  A  →  <server-public-ip>
```

---

## Step 2: Database Setup (Reuse Existing PostgreSQL)

Connect to the existing PostgreSQL instance and create a dedicated database:

```sql
-- Connect to existing PostgreSQL
psql -U postgres -h localhost

-- Create a new database for the App Builder
CREATE DATABASE openvts_app_studio;

-- Option A: Reuse existing user
GRANT ALL PRIVILEGES ON DATABASE openvts_app_studio TO openvts;

-- Option B: Create a dedicated user (more secure)
CREATE USER appstudio WITH ENCRYPTED PASSWORD '<strong-password-here>';
GRANT ALL PRIVILEGES ON DATABASE openvts_app_studio TO appstudio;
```

**Resulting DATABASE_URL:**

```
# If PostgreSQL is in Docker (use container name):
postgresql://appstudio:<password>@postgres:5432/openvts_app_studio?schema=public

# If PostgreSQL is on host:
postgresql://appstudio:<password>@host.docker.internal:5432/openvts_app_studio?schema=public

# If using existing openvts user:
postgresql://openvts:<password>@postgres:5432/openvts_app_studio?schema=public
```

> **Important:** Run `docker network ls` to find the network where your PostgreSQL container lives. The App Builder container must join the same network.

---

## Step 3: Environment File

Create a `.env` file on the server (NOT committed to git):

```bash
# /opt/openvts-appbuilder/.env (or wherever you clone the project)

# Application
NODE_ENV=production
PORT=8082
HOSTNAME=0.0.0.0
NEXT_PUBLIC_APP_NAME="OpenVTS App Studio"
NEXT_PUBLIC_APP_URL="https://studio.openvts.io"
NEXT_PUBLIC_DEMO_MODE="false"

# Authentication (Google OAuth)
# Callback URL: https://studio.openvts.io/api/auth/callback/google
AUTH_SECRET="<generate: openssl rand -base64 32>"
AUTH_GOOGLE_ID="<google-oauth-client-id>"
AUTH_GOOGLE_SECRET="<google-oauth-client-secret>"

# Database (REUSE EXISTING PostgreSQL)
DATABASE_URL="postgresql://appstudio:<password>@postgres:5432/openvts_app_studio?schema=public"

# Storage
STORAGE_DRIVER=local
LOCAL_STORAGE_ROOT=./data

# Signing encryption (generate: openssl rand -hex 32)
SIGNING_ENCRYPTION_KEY="<64-hex-characters>"

# Flutter build worker
FLUTTER_BIN=/opt/flutter/bin/flutter
FLUTTER_TEMPLATE_ROOT=./templates/flutter_base
BUILD_WORKSPACE_ROOT=./data/workspaces
BUILD_ARTIFACT_ROOT=./data/artifacts
BUILD_CONCURRENCY=2
BUILD_TIMEOUT_MS=1200000
BUILD_POLL_INTERVAL_MS=2000
```

---

## Step 4: Docker Compose File

Create `docker-compose.yml` in the project root:

```yaml
version: "3.8"

services:
  appbuilder:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: openvts-appbuilder
    restart: unless-stopped
    ports:
      - "8082:8082"
    env_file:
      - .env
    volumes:
      - appbuilder-data:/app/data
    networks:
      - openvts-network

  # Optional: separate worker for Flutter APK builds
  appbuilder-worker:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: openvts-appbuilder-worker
    restart: unless-stopped
    command: ["npx", "tsx", "worker/build-worker.ts"]
    env_file:
      - .env
    volumes:
      - appbuilder-data:/app/data
    networks:
      - openvts-network

volumes:
  appbuilder-data:
    driver: local

networks:
  openvts-network:
    external: true  # Join existing network where PostgreSQL lives
```

> **Finding your network name:** Run `docker network ls` and look for the network your PostgreSQL container uses. Replace `openvts-network` with that name.

---

## Step 5: Update Dockerfile for Port 8082

The Dockerfile must be modified to use port 8082 instead of 3000 (since 3000 is already occupied by `openvts.io`).

Update these lines in `Dockerfile`:

```dockerfile
# Change FROM:
EXPOSE 3000
ENV PORT=3000

# Change TO:
EXPOSE 8082
ENV PORT=8082
```

> **Why:** Port 3000 on this server is already taken by the main `openvts.io` website container. This application must use 8082 everywhere — inside and outside the container — to avoid any conflict.

---

## Step 6: Build & Start the Container

```bash
# Clone the repository on the server
cd /opt
git clone <repo-url> openvts-appbuilder
cd openvts-appbuilder

# Copy .env file (created in Step 3)
cp /path/to/.env .env

# Build the Docker image (takes 10-15 min due to Flutter/Android SDK)
docker compose build

# Start the containers
docker compose up -d

# Run database migrations
docker compose exec appbuilder npx prisma migrate deploy

# (Optional) Seed initial data
docker compose exec appbuilder npx tsx prisma/seed.ts
```

---

## Step 7: Nginx Configuration

Create `/etc/nginx/sites-available/studio.openvts.io`:

```nginx
server {
    listen 80;
    server_name studio.openvts.io;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name studio.openvts.io;

    ssl_certificate /etc/letsencrypt/live/studio.openvts.io/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/studio.openvts.io/privkey.pem;

    # Allow large uploads (APKs, assets)
    client_max_body_size 200M;

    location / {
        proxy_pass http://127.0.0.1:8082;
        proxy_http_version 1.1;

        # WebSocket support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # Standard proxy headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # SSE (Server-Sent Events) for build progress streaming
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 600s;
    }
}
```

Enable the site and get SSL:

```bash
# Create symlink
sudo ln -s /etc/nginx/sites-available/studio.openvts.io /etc/nginx/sites-enabled/

# Get SSL certificate
sudo certbot --nginx -d studio.openvts.io

# Test and reload
sudo nginx -t
sudo systemctl reload nginx
```

---

## Step 8: Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create OAuth 2.0 credentials (or update existing)
3. Add authorized redirect URI:
   ```
   https://studio.openvts.io/api/auth/callback/google
   ```
4. Copy Client ID and Secret into your `.env` file

---

## Step 9: Post-Deployment Verification

```bash
# 1. Check containers are running
docker ps | grep appbuilder

# 2. Check logs for errors
docker compose logs -f appbuilder
docker compose logs -f appbuilder-worker

# 3. Test internal connectivity
curl -I http://localhost:8082

# 4. Test external access
curl -I https://studio.openvts.io

# 5. Test database connection
docker compose exec appbuilder npx prisma db execute --stdin <<< "SELECT 1;"

# 6. Check Flutter is working inside container
docker compose exec appbuilder flutter --version
```

---

## Architecture Diagram

```
                         Internet
                            │
                            ▼
                    ┌──────────────┐
                    │   Nginx :80  │
                    │   (SSL :443) │
                    └──────┬───────┘
                           │
         ┌─────────────────┼───────────────────────┐
         │                 │                       │
         ▼                 ▼                       ▼
   openvts.io         studio.openvts.io       crm/mautic/agent
         │                 │                   (existing)
         ▼                 ▼
  ┌─────────────┐  ┌─────────────────────┐
  │  Container  │  │  Container (NEW)    │
  │  Port: 3000 │  │  Port: 8082         │
  │  (OCCUPIED) │  │                     │
  │             │  │  - Next.js :8082    │
  │  website    │  │  - Flutter SDK      │
  │             │  │  - Android SDK      │
  │             │  │  - Java 17          │
  └──────┬──────┘  └──────────┬──────────┘
         │                    │
         └─────────┬──────────┘
                   ▼
         ┌───────────────────┐
         │   PostgreSQL       │
         │   (EXISTING)       │
         │                    │
         │  DB: n8n           │
         │  DB: openvts       │
         │  DB: openvts_app_  │ ← NEW database only
         │      studio        │
         └───────────────────┘

  ⚠️  Port 3000 = RESERVED (openvts.io website)
  ✅  Port 8082 = App Builder (this application)
```

---

## Disk Space Requirements

| Component | Size |
|-----------|------|
| Docker image (Flutter + Android SDK + App) | ~4-5 GB |
| Build workspace (per concurrent build) | ~500 MB |
| Artifacts (APKs stored) | Grows over time |

**Recommended:** Ensure at least **15 GB** free disk space on the server.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| **Port conflict with openvts.io** | **NEVER use port 3000** — it belongs to the main website. This app must use 8082 only |
| Container can't reach PostgreSQL | Check Docker network — container must be on same network as DB |
| Build worker fails | Check `flutter --version` inside container; ensure Android licenses accepted |
| Nginx 502 Bad Gateway | Container not running or wrong port mapping — check `docker ps` |
| SSE/build progress not streaming | Ensure `proxy_buffering off` is set in Nginx |
| Large file upload fails | Increase `client_max_body_size` in Nginx |
| OAuth redirect mismatch | Verify callback URL in Google Console matches exactly |

---

## Maintenance Commands

```bash
# Update application
cd /opt/openvts-appbuilder
git pull
docker compose build
docker compose up -d
docker compose exec appbuilder npx prisma migrate deploy

# View logs
docker compose logs -f --tail=100

# Restart
docker compose restart appbuilder

# Stop (without removing)
docker compose stop

# Full cleanup (careful!)
docker compose down -v  # This removes volumes/data!
```

---

## Security Notes

- Never commit `.env` to git
- Use strong passwords for database user
- Keep `AUTH_SECRET` and `SIGNING_ENCRYPTION_KEY` unique and secret
- Regularly update the Docker image for security patches
- Consider adding rate limiting in Nginx for public endpoints
