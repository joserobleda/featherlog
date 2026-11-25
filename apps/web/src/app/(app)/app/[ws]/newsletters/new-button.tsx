"use client";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useActionRunner } from "@/components/settings/use-action";
import { Button } from "@/components/ui/button";
import { createNewsletterAction } from "./actions";

export function NewNewsletterButton({ wsSlug, disabled }: { wsSlug: string; disabled: boolean }) {
  const t = useTranslations("newsletters");
  const router = useRouter();
  const { pending, run } = useActionRunner();
  return (
    <Button
      type="button"
      disabled={disabled}
      loading={pending}
      onClick={() =>
        run(() => createNewsletterAction(wsSlug), {
          onSuccess: (d) => router.push(`/app/${wsSlug}/newsletters/${d.id}`),
        })
      }
    >
      {pending ? null : <Plus />} {t("new")}
    </Button>
  );
}
