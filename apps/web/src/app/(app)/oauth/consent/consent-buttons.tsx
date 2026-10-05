"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function ConsentButtons({
  allowLabel,
  denyLabel,
}: {
  allowLabel: string;
  denyLabel: string;
}) {
  const [pending, setPending] = useState<"allow" | "deny" | null>(null);

  async function decide(accept: boolean) {
    setPending(accept ? "allow" : "deny");
    // The oauth-provider client plugin forwards the signed authorization query automatically.
    const { data, error } = await authClient.oauth2.consent({ accept });
    const url =
      (data as { url?: string; redirectURI?: string } | null)?.url ??
      (data as { redirectURI?: string } | null)?.redirectURI;
    if (error || !url) {
      setPending(null);
      toast.error(error?.message ?? "Authorization failed");
      return;
    }
    window.location.href = url;
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <Button
        variant="secondary"
        onClick={() => decide(false)}
        loading={pending === "deny"}
        disabled={!!pending}
      >
        {denyLabel}
      </Button>
      <Button onClick={() => decide(true)} loading={pending === "allow"} disabled={!!pending}>
        {allowLabel}
      </Button>
    </div>
  );
}
