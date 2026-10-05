"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { acceptInvitationAction } from "./actions";

export function AcceptButton({ token }: { token: string }) {
  const t = useTranslations("settings.invite");
  const [pending, start] = useTransition();
  return (
    <Button
      size="lg"
      className="w-full"
      loading={pending}
      onClick={() =>
        start(async () => {
          const res = await acceptInvitationAction(token);
          if (res && !res.ok) toast.error(res.error);
        })
      }
    >
      {t("accept")}
    </Button>
  );
}

export function SignOutButton() {
  const t = useTranslations("settings.invite");
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="secondary"
      className="w-full"
      loading={pending}
      onClick={() =>
        start(async () => {
          await authClient.signOut();
          router.refresh();
        })
      }
    >
      {t("signOut")}
    </Button>
  );
}
