import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  feedbackFromMailgunEvent,
  mailgunVariables,
  verifyMailgunSignature,
} from "@/server/newsletters/mailgun";

const sign = (key: string, timestamp: string, token: string) => ({
  timestamp,
  token,
  signature: createHmac("sha256", key)
    .update(timestamp + token)
    .digest("hex"),
});

const vars = JSON.parse(
  mailgunVariables({ workspaceId: "ws1", subscriberId: "s1", newsletterId: "n1" }),
);

describe("Mailgun webhooks", () => {
  it("verifies the signature and rejects stale or forged ones", () => {
    const now = 1_800_000_000_000;
    const ts = String(now / 1000);
    expect(verifyMailgunSignature("key", sign("key", ts, "tok"), now)).toBe(true);
    expect(verifyMailgunSignature("other", sign("key", ts, "tok"), now)).toBe(false);
    expect(verifyMailgunSignature("key", { ...sign("key", ts, "tok"), token: "x" }, now)).toBe(
      false,
    );
    expect(verifyMailgunSignature("key", sign("key", String(now / 1000 - 3600), "tok"), now)).toBe(
      false,
    );
    expect(verifyMailgunSignature("key", undefined, now)).toBe(false);
  });

  it("turns permanent failures, complaints and unsubscribes into feedback", () => {
    expect(
      feedbackFromMailgunEvent({
        event: "failed",
        severity: "permanent",
        reason: "bounce",
        "user-variables": vars,
        "delivery-status": { code: 550, description: "No such user" },
      }),
    ).toEqual({
      workspaceId: "ws1",
      subscriberId: "s1",
      newsletterId: "n1",
      kind: "bounced",
      reason: "550 No such user",
    });
    expect(feedbackFromMailgunEvent({ event: "complained", "user-variables": vars })?.kind).toBe(
      "complained",
    );
    expect(feedbackFromMailgunEvent({ event: "unsubscribed", "user-variables": vars })?.kind).toBe(
      "unsubscribed",
    );
  });

  it("ignores temporary failures, other events and emails that aren't newsletters", () => {
    expect(
      feedbackFromMailgunEvent({ event: "failed", severity: "temporary", "user-variables": vars }),
    ).toBeNull();
    expect(feedbackFromMailgunEvent({ event: "delivered", "user-variables": vars })).toBeNull();
    expect(feedbackFromMailgunEvent({ event: "complained", "user-variables": {} })).toBeNull();
    expect(feedbackFromMailgunEvent(undefined)).toBeNull();
  });
});
