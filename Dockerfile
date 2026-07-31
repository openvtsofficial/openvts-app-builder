FROM node:20-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl ca-certificates curl unzip git xz-utils \
    lib32stdc++6 libglu1-mesa openjdk-17-jdk-headless \
  && rm -rf /var/lib/apt/lists/*

ENV JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
ENV ANDROID_SDK_ROOT=/opt/android-sdk
ENV FLUTTER_ROOT=/opt/flutter
ENV PATH="${FLUTTER_ROOT}/bin:${ANDROID_SDK_ROOT}/cmdline-tools/latest/bin:${ANDROID_SDK_ROOT}/platform-tools:${PATH}"

# Install Android SDK command-line tools
RUN mkdir -p ${ANDROID_SDK_ROOT}/cmdline-tools && \
    curl -fsSL https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip -o /tmp/cmdtools.zip && \
    unzip -q /tmp/cmdtools.zip -d ${ANDROID_SDK_ROOT}/cmdline-tools && \
    mv ${ANDROID_SDK_ROOT}/cmdline-tools/cmdline-tools ${ANDROID_SDK_ROOT}/cmdline-tools/latest && \
    rm /tmp/cmdtools.zip && \
    yes | sdkmanager --licenses > /dev/null 2>&1 && \
    sdkmanager "platform-tools" "platforms;android-34" "platforms;android-36" "build-tools;34.0.0" "build-tools;28.0.3"

# Install Flutter SDK
RUN git clone --depth 1 --branch stable https://github.com/flutter/flutter.git ${FLUTTER_ROOT} && \
    flutter precache --android && \
    flutter config --no-analytics && \
    dart --disable-analytics

# ---------- Build stage ----------
FROM base AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts

COPY prisma ./prisma
RUN npx prisma generate

COPY . .

ENV NEXT_PUBLIC_DEMO_MODE=false

RUN npm run setup && \
    sed -i '/org.gradle.java.home/d' templates/flutter_base/android/gradle.properties && \
    sed -i 's/-Xmx[0-9]*G/-Xmx2G/; s/MaxMetaspaceSize=[0-9]*G/MaxMetaspaceSize=1G/; s/ReservedCodeCacheSize=[0-9]*m/ReservedCodeCacheSize=256m/' templates/flutter_base/android/gradle.properties && \
    npm run build

# ---------- Production stage ----------
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --home /home/nextjs nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/templates ./templates
COPY --from=builder /app/worker ./worker
COPY --from=builder /app/src/lib ./src/lib
COPY --from=builder /app/src/generated ./src/generated
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts

RUN mkdir -p data/workspaces data/artifacts data/uploads data/logs && \
    chown -R nextjs:nodejs data

RUN chown -R nextjs:nodejs /opt/flutter /opt/android-sdk && \
    mkdir -p /home/nextjs/.gradle /home/nextjs/.config/flutter /home/nextjs/.cache && \
    chown -R nextjs:nodejs /home/nextjs

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV HOME=/home/nextjs
ENV FLUTTER_BIN=/opt/flutter/bin/flutter

CMD ["node", "server.js"]
