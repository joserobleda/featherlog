export type ErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "validation"
  | "conflict"
  | "precondition_failed"
  | "rate_limited";

const STATUS: Record<ErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  validation: 422,
  conflict: 409,
  precondition_failed: 412,
  rate_limited: 429,
};

/** Domain error. Every entry point (panel, REST API, MCP) maps it to its own format. */
export class AppError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
    this.status = STATUS[code];
  }
}

export const notFound = (what: string) => new AppError("not_found", `${what} not found`);
export const forbidden = (msg = "You do not have permission to do this") => new AppError("forbidden", msg);
export const isAppError = (e: unknown): e is AppError => e instanceof AppError;
