import type { NewsletterStatus } from "@featherlog/core";

export const STATUS_TONE: Record<
  NewsletterStatus,
  "neutral" | "brand" | "warning" | "success" | "danger"
> = {
  generating: "brand",
  draft: "neutral",
  sending: "warning",
  sent: "success",
  failed: "danger",
};
