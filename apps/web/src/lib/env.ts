import { z } from "zod";

const bool = z
  .enum(["true", "false", "1", "0", ""])
  .optional()
  .transform((v) => v === "true" || v === "1");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z
    .string()
    .min(1)
    .default("postgres://featherlog:featherlog@localhost:5442/featherlog"),
  AUTH_SECRET: z.string().min(16).default("dev-secret-change-me-dev-secret-change-me"),
  APP_URL: z.url().default("http://localhost:3100"),
  PUBLIC_URL: z.url().optional(),
  WIDGET_URL: z.url().optional(),
  SIGNUP_MODE: z.enum(["open", "invite", "closed"]).default("open"),
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  UPLOADS_DIR: z.string().default("./uploads"),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("auto"),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_PUBLIC_URL: z.string().optional(),
  SMTP_URL: z.string().default("smtp://localhost:1025"),
  MAIL_FROM: z.string().default("Featherlog <no-reply@localhost>"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  WORKER_MODE: z.enum(["inline", "separate", "off"]).default("inline"),
  MIGRATE_ON_START: bool,
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

function load() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const env = parsed.data;
  if (env.NODE_ENV === "production" && env.AUTH_SECRET.startsWith("dev-secret")) {
    // Only warn: `next build` evaluates modules with NODE_ENV=production.
    console.warn("[featherlog] AUTH_SECRET is not set — set a long random value in production.");
  }
  if (
    env.STORAGE_DRIVER === "s3" &&
    !(env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY)
  ) {
    throw new Error(
      "STORAGE_DRIVER=s3 requires S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY",
    );
  }
  const strip = (u: string) => u.replace(/\/+$/, "");
  return {
    ...env,
    APP_URL: strip(env.APP_URL),
    PUBLIC_URL: strip(env.PUBLIC_URL ?? env.APP_URL),
    WIDGET_URL: strip(env.WIDGET_URL ?? env.APP_URL),
    googleEnabled: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
  };
}

export const env = load();
export type Env = typeof env;
