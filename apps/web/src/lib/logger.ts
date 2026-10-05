import pino from "pino";
import { env } from "./env";

export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: "featherlog" },
  redact: ["req.headers.authorization", "req.headers.cookie", "*.password", "*.secret", "*.token"],
});
