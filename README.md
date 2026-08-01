# OpenVTS App Studio

An enterprise-ready, no-code application studio for generating branded Android and iOS Flutter projects from a controlled base template.

## What is included

- Google SSO through Auth.js
- Next.js App Router, TypeScript and Tailwind CSS
- PostgreSQL with Prisma ORM 7
- Workspace-isolated project CRUD and audit records
- Separate Android application name/package and iOS application name/bundle ID
- Independent light and dark application logos
- Icon Kitchen ZIP and extracted-folder upload with structural validation
- Immediate Android/iOS and light/dark application preview
- Debug APK, release APK, signed APK, AAB and Flutter source actions
- Revision-aware artifact reuse: current builds download immediately and changed projects require a fresh build
- AES-256-GCM encrypted signing credentials and private keystore storage
- Durable PostgreSQL build queue using `FOR UPDATE SKIP LOCKED`
- Isolated Flutter worker with live Server-Sent Event progress
- Local private storage for development and S3-compatible storage for production
- Docker Compose deployment topology
- Interactive demo mode when PostgreSQL or Flutter are unavailable

## Quick preview

```bash
cp .env.example .env
npm install
npm run dev
```

Keep `NEXT_PUBLIC_DEMO_MODE="true"` to explore the complete UI without external services. Open `http://localhost:3000`, then choose **Open demo**.

Demo mode provides working project creation, persistence, branding, Icon Kitchen inspection, live preview, source archive generation and visible build-stage simulation. APK/AAB binaries are intentionally generated only by the isolated Flutter worker.

## Production setup

1. Copy `.env.example` to `.env`.
2. Set a strong PostgreSQL password, `AUTH_SECRET`, Google OAuth credentials and a random 64-character hexadecimal `SIGNING_ENCRYPTION_KEY`.
3. In Google Cloud, register this callback:

   ```text
   https://your-domain.example/api/auth/callback/google
   ```

4. Set `NEXT_PUBLIC_DEMO_MODE="false"`.
5. Start the services:

   ```bash
   docker compose up --build
   ```

The `migrate` service applies the database migrations before the web and worker services start.

## Local development with an existing PostgreSQL server

```bash
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Run the Flutter worker in a second terminal on a machine that has Flutter, the Android SDK, Gradle and JDK 17 or later:

```bash
npm run worker
```

## Build pipeline

Each release follows a controlled sequence:

1. Claim one queued job with a short indexed PostgreSQL transaction.
2. Generate a clean Flutter platform workspace.
3. Overlay the versioned OpenVTS template.
4. Apply Android and iOS identities.
5. convert and install light/dark logo assets.
6. Validate and install Icon Kitchen assets.
7. Resolve dependencies.
8. Compile and optionally sign the artifact.
9. Store the artifact privately, record its checksum and delete the temporary workspace.

The web process never executes Flutter or Gradle. Builds are isolated from web traffic and can be scaled by adding worker replicas.

## Icon Kitchen input

The importer accepts the archive downloaded from [Icon Kitchen](https://icon.kitchen/) or its extracted folder. At minimum it checks:

- Android launcher PNGs for mdpi through xxxhdpi
- iOS `Contents.json`
- iOS 1024×1024 marketing icon

Adaptive, monochrome and web icons are installed when present. Archive paths are normalized and only recognized icon directories can be written into the generated project.

## Security notes

- Never commit `.env`, keystores, signing passwords or generated artifacts.
- Use S3-compatible private object storage in multi-server production environments.
- Keep `SIGNING_ENCRYPTION_KEY` in a secret manager and rotate it through a controlled migration.
- Pin the Flutter worker base image to an approved digest before production rollout.
- Run workers with CPU, memory, process and network limits appropriate to your infrastructure.
- APK/AAB artifacts are served only after ownership checks or short-lived signed URLs.

## Verification

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

The repository intentionally keeps the Flutter worker separate from the Next.js request path, allowing the dashboard and PostgreSQL operations to stay responsive during expensive native builds.

## Deployment

The project includes a CI/CD workflow (`.github/workflows/ci-cd.yml`) that automatically:
1. Runs lint, typecheck, and tests on every push
2. Builds and pushes Docker image to GitHub Container Registry (GHCR)
3. Deploys to AWS EC2 on push to `main` branch

### Required GitHub Secrets

Configure these in **Settings → Secrets and variables → Actions → Repository secrets**:

- `AWS_EC2_HOST` - Server IP address (e.g., `3.108.163.45`)
- `AWS_EC2_USER` - SSH user (e.g., `ubuntu`)
- `AWS_EC2_SSH_KEY` - Private SSH key (PEM format, entire file contents)

### Server Setup

The deployment expects this directory structure on the server:

```
/opt/studio/app/
├── docker-compose.prod.yml
├── .env (created from .env.production)
└── [git repository files]
```

The `.env` file must contain:
```bash
AUTH_SECRET=<random-64-char-string>
AUTH_GOOGLE_ID=<google-oauth-client-id>
AUTH_GOOGLE_SECRET=<google-oauth-client-secret>
SIGNING_ENCRYPTION_KEY=<64-char-hex-string>
```

### Manual Deployment

If CI/CD is not configured, deploy manually:

```bash
# On the server
cd /opt/studio/app
git pull origin main
cp .env.production .env  # if .env doesn't exist
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
docker exec studio-openvts npx prisma migrate deploy
```
