FROM node:24-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20 AS base
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl ca-certificates curl unzip git xz-utils \
    lib32stdc++6 libglu1-mesa openjdk-17-jdk-headless procps \
  && rm -rf /var/lib/apt/lists/*

ENV JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
ENV ANDROID_SDK_ROOT=/opt/android-sdk
ENV FLUTTER_ROOT=/opt/flutter
ENV PATH="${FLUTTER_ROOT}/bin:${ANDROID_SDK_ROOT}/cmdline-tools/latest/bin:${ANDROID_SDK_ROOT}/platform-tools:${PATH}"
ENV HOME=/home/nextjs

# Install the SDKs as their runtime owner, without duplicating them in a chown layer.
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --home /home/nextjs nextjs && \
    mkdir -p ${ANDROID_SDK_ROOT} ${FLUTTER_ROOT} /home/nextjs/.gradle /home/nextjs/.config/flutter /home/nextjs/.cache && \
    chown -R nextjs:nodejs ${ANDROID_SDK_ROOT} ${FLUTTER_ROOT} /home/nextjs
USER nextjs

# Install Android SDK command-line tools
RUN mkdir -p ${ANDROID_SDK_ROOT}/cmdline-tools && \
    curl -fsSL https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip -o /tmp/cmdtools.zip && \
    unzip -q /tmp/cmdtools.zip -d ${ANDROID_SDK_ROOT}/cmdline-tools && \
    mv ${ANDROID_SDK_ROOT}/cmdline-tools/cmdline-tools ${ANDROID_SDK_ROOT}/cmdline-tools/latest && \
    rm /tmp/cmdtools.zip && \
    yes | sdkmanager --licenses > /dev/null 2>&1 && \
    sdkmanager "platform-tools" "platforms;android-34" "platforms;android-35" "platforms;android-36" \
        "build-tools;34.0.0" "build-tools;35.0.0" "build-tools;28.0.3" \
        "ndk;28.2.13676358" "cmake;3.22.1"

# Install the verified toolchain; application source is fetched at runtime.
ARG FLUTTER_VERSION=3.44.8
RUN git clone --depth 1 --branch ${FLUTTER_VERSION} https://github.com/flutter/flutter.git ${FLUTTER_ROOT} && \
    flutter precache --android && \
    flutter config --no-analytics && \
    dart --disable-analytics && \
    mkdir -p /tmp/flutter-warmup && \
    cd /tmp/flutter-warmup && \
    flutter create warmup_app && \
    cd warmup_app && \
    flutter pub get && \
    cd / && rm -rf /tmp/flutter-warmup

# ---------- Build stage ----------
FROM base AS builder
USER root
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts

COPY prisma ./prisma
RUN npx prisma generate

COPY . .

ENV NEXT_PUBLIC_DEMO_MODE=false
ENV NEXT_PUBLIC_APP_URL=https://studio.openvts.io

RUN npm run setup && npm run build

# ---------- Production stage ----------
FROM base AS runner
USER root
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/worker ./worker
COPY --from=builder /app/src/lib ./src/lib
COPY --from=builder /app/src/generated ./src/generated
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/scripts/deployment-probe.mjs ./scripts/deployment-probe.mjs

RUN mkdir -p data/workspaces data/artifacts data/uploads data/logs && \
    chown -R nextjs:nodejs data

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV HOME=/home/nextjs
ENV FLUTTER_BIN=/opt/flutter/bin/flutter
ENV DISABLE_EMBEDDED_WORKER=true

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
