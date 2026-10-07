import { z } from "zod";

const serverSchema = z.object({
  DATABASE_URL: z.string().min(1).default("postgresql://openvts:openvts@localhost:5432/openvts_app_studio"),
  AUTH_SECRET: z.string().min(16).default("demo-only-secret-change-in-production"),
  AUTH_GOOGLE_ID: z.string().default("demo-google-client-id"),
  AUTH_GOOGLE_SECRET: z.string().default("demo-google-client-secret"),
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  LOCAL_STORAGE_ROOT: z.string().default("./data"),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().default("openvts-app-studio"),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z.string().default("true"),
  SIGNING_ENCRYPTION_KEY: z.string().default("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"),
  FLUTTER_TEMPLATE_REPOSITORY: z.string().url().default("https://github.com/openvtsofficial/openvts-application.git"),
  FLUTTER_TEMPLATE_BRANCH: z.string().min(1).default("main"),
  GIT_BIN: z.string().min(1).default("git"),
  GIT_CLONE_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),
  SIGNING_KEYSTORE_PATH: z.string().default("./signing/application-key.jks"),
  SIGNING_KEY_ALIAS: z.string().optional(),
  SIGNING_STORE_PASSWORD: z.string().optional(),
  SIGNING_KEY_PASSWORD: z.string().optional(),
  GRADLE_JVM_ARGS: z.string().optional(),
  BUILD_WORKSPACE_ROOT: z.string().default("./data/workspaces"),
  BUILD_ARTIFACT_ROOT: z.string().default("./data/artifacts"),
  BUILD_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(2000),
  BUILD_TIMEOUT_MS: z.coerce.number().int().positive().default(3_600_000),
  BUILD_MIN_HOST_AVAILABLE_MB: z.coerce.number().int().nonnegative().default(0),
  BUILD_CRITICAL_HOST_AVAILABLE_MB: z.coerce.number().int().nonnegative().default(0),
  FLUTTER_BIN: z.string().default("flutter"),
});

export const env = serverSchema.parse(process.env);

export const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";
