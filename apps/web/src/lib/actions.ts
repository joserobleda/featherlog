import "server-only";
import { isAppError } from "@featherlog/core";
import { ZodError } from "zod";
import { logger } from "./logger";

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string; fieldErrors?: Record<string, string> };

/** Runs a server action body and maps domain/validation errors to a serializable result. */
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    if (err instanceof ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of err.issues) {
        const key = issue.path.join(".") || "_";
        fieldErrors[key] ??= issue.message;
      }
      return {
        ok: false,
        error: err.issues[0]?.message ?? "Invalid input",
        code: "validation",
        fieldErrors,
      };
    }
    if (isAppError(err)) {
      const field = (err.details as { field?: string } | undefined)?.field;
      return {
        ok: false,
        error: err.message,
        code: err.code,
        fieldErrors: field ? { [field]: err.message } : undefined,
      };
    }
    // Let Next.js redirect()/notFound() propagate.
    if (err && typeof err === "object" && "digest" in err) throw err;
    logger.error({ err }, "server action failed");
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
