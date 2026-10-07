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
- Fresh GitHub source for every build/export, with separate saved artifact downloads
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
2. Clone the latest `main` from `https://github.com/openvtsofficial/openvts-application.git` into a clean workspace.
3. Record the exact Git commit in `studio-manifest.json`; Git failures stop the job.
4. Apply Android and iOS identities.
5. convert and install light/dark logo assets.
6. Validate and install Icon Kitchen assets.
7. Resolve dependencies.
8. Compile and optionally sign the artifact.
9. Store the artifact privately, record its checksum and delete the temporary workspace.

The web process never executes Flutter or Gradle. Source exports use Git directly without running Flutter. The production deployment has one worker with a 3500 MB memory limit, one Gradle worker and in-process Kotlin compilation. This keeps build memory bounded on the shared 8 GB host. Native compilation has a 60-minute deadline for the shared two-core server and may be silent while Flutter compiles; quiet output does not cancel an active build. The worker refreshes its job lease and recovers interrupted jobs within their retry limit.

The upstream generated `mobileText` lookup currently contains thousands of cases and stalls ARM AOT compilation as one large expression. Studio preserves its cases and parameters in smaller functions with a constant dispatch table. `studio-manifest.json` records `bounded-mobile-text-lookup` in `sourceAdjustments` when this adjustment is applied. Downloaded source includes the same adjustment and an updated Dart regeneration tool, so regenerating translations keeps builds compatible.

All release APKs and bundles use the configured signing key, including a project's uploaded signing profile when present. Keep the existing key to preserve update compatibility. Mount `./signing` read-only, make the keystore readable by container UID 1001, and set `SIGNING_KEY_ALIAS`, `SIGNING_STORE_PASSWORD`, and `SIGNING_KEY_PASSWORD` in the server environment. **Build & release → Download JKS** requires authentication and project ownership and downloads that project's build key. Source ZIPs exclude keystores and local signing properties. Keystores are excluded from new Git commits and Docker images; removing a previously tracked key does not erase it from Git history.

On the shared production host, Gradle's heap is limited to 768 MB. Native jobs wait until Linux reports at least 3200 MB of available host memory. During commands, the worker checks memory every five seconds and stops the process tree below 512 MB, deferring a retry within the job's retry limit. Source ZIP jobs can still run while native jobs wait. Keep image builds and exports separate from native compilation on this host.

Gradle uses periodic G1 collection and a low free-heap target to release unused memory while Flutter compiles. The worker is also the preferred OOM target if host memory is exhausted despite these checks.

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

The workflow `.github/workflows/ci-cd.yml` validates pull requests and deploys pushes to `main`. A manual run on `main` also deploys. Production runs are serialized; a later push does not cancel an active deployment.

1. Run lint, type checking, unit tests, deployment/rollback tests and workflow validation.
2. Build the production Linux image on the GitHub runner, with demo mode disabled and the pinned Flutter/Android toolchain.
3. Test that image against a temporary PostgreSQL 16 database: apply migrations, verify runtime dependencies and check the production web server and unauthenticated API response.
4. Publish the verified image to GHCR under the full commit SHA and pass its immutable digest to deployment.
5. Transfer only the matching deployment configuration over SSH. No `git pull`, server-side image build, Nginx reload, other-service restart or Docker prune is performed.
6. Gracefully stop Studio's worker after its current build finishes; new build requests remain queued. Pull the image, apply migrations and verify the existing signing key and database schema before replacing the web container.
7. Verify production HTTP health, start the worker and record the successful release. A failed deployment restores the previous Studio images and configuration.

The deployment controller fixes the Compose project to `app` and requires the existing external `app_studio-data` volume and `compose_openvts` network. The signing directory remains `/opt/studio/app/signing`; CPU/memory limits and build-memory safeguards are checked before a deployment can proceed. State and rollback records are private under `/opt/studio/app/.deploy-state/` and excluded from Git and Docker build contexts.

Container rollback does not undo database migrations. New migrations must remain compatible with the running and previous application versions; use additive migrations and keep database backups before destructive schema changes. The web container restart can cause a brief interruption to Studio.

### Required GitHub Secrets

Configure these in **Settings → Environments → production → Environment secrets** (repository secrets are also supported). Missing credentials fail the deployment job; a green run must never silently skip deployment.

- `AWS_EC2_HOST` - Server IP address (e.g., `3.108.163.45`)
- `AWS_EC2_USER` - SSH user (e.g., `ubuntu`)
- `AWS_EC2_SSH_KEY` - Private SSH key (PEM format, entire file contents)
- `AWS_EC2_KNOWN_HOSTS` - Trusted SSH host-key line for the exact host above. Verify it through an existing trusted server connection; do not trust a fresh unverified `ssh-keyscan` during deployment.

GHCR uses the run's short-lived `GITHUB_TOKEN`, with package write access only in the image job and package read access in deployment. Its temporary server login is removed after deployment. SSH secrets are never packaged into the image or copied into the release payload.

### Server Setup

The deployment expects this directory structure on the server:

```
/opt/studio/app/
├── docker-compose.prod.yml
├── .env.production (existing runtime secrets)
├── signing/application-key.jks (existing signing identity)
├── .deploy-state/ (private release/configuration rollback records)
└── [git repository files; deployments do not reset this checkout]
```

The server's `.env.production` file must contain:
```bash
AUTH_SECRET=<random-64-char-string>
DATABASE_URL=<studio-postgresql-connection-url>
AUTH_GOOGLE_ID=<google-oauth-client-id>
AUTH_GOOGLE_SECRET=<google-oauth-client-secret>
SIGNING_ENCRYPTION_KEY=<64-char-hex-string>
SIGNING_KEY_ALIAS=<existing-key-alias>
SIGNING_STORE_PASSWORD=<existing-store-password>
SIGNING_KEY_PASSWORD=<existing-key-password>
DOCKER_IMAGE=<last verified image digest>
```

### Manual Deployment

To run the same deployment controller manually, use the configuration and script from the exact release commit and the verified GHCR digest. The server needs authenticated GHCR access if the package is private. A preflight check validates the server without pulling images or changing services:

```bash
# From the release directory containing docker-compose.prod.yml and scripts/
bash scripts/deploy-studio.sh \
  ghcr.io/openvtsofficial/openvts-app-builder@sha256:<verified-digest> \
  <full-40-character-commit> --check

# Omit --check to perform the deployment.
```
