"use client";
import { KeyRound, RotateCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/settings/confirm-dialog";
import { CodeBlock, CopyField } from "@/components/settings/copy-field";
import { useActionRunner } from "@/components/settings/use-action";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { setWidgetIdentityAction } from "./actions";

export function IdentityCard({
  wsSlug,
  publicId,
  secret,
}: {
  wsSlug: string;
  publicId: string;
  secret: string | null;
}) {
  const t = useTranslations("settings.widget.identity");
  const { pending, run } = useActionRunner();
  const set = async (mode: "rotate" | "disable") => {
    const r = await setWidgetIdentityAction(wsSlug, mode);
    if (!r.ok) {
      toast.error(r.error);
      return false;
    }
  };
  const serverCode = `// ${t("serverComment")}
import { createHmac } from "node:crypto";

const featherlogUser = {
  id: String(user.id), // ${t("idComment")}
  hash: createHmac("sha256", process.env.FEATHERLOG_WIDGET_SECRET)
    .update(String(user.id))
    .digest("hex"),
};`;
  const clientCode = `var HW_config = {
  selector: ".featherlog-badge",
  account: "${publicId}",
  user: featherlogUser, // { id, hash }
};`;
  return (
    <Card>
      <CardHeader title={t("title")} description={t("description")} />
      <CardBody className="grid gap-4">
        {secret ? (
          <>
            <div className="grid gap-1.5">
              <span className="text-sm font-medium">{t("secret")}</span>
              <CopyField value={secret} aria-label={t("secret")} />
              <p className="text-[13px] text-fg-muted">{t("secretHint")}</p>
            </div>
            <CodeBlock code={serverCode} label={t("serverLabel")} />
            <CodeBlock code={clientCode} label={t("clientLabel")} />
            <div className="flex flex-wrap gap-2">
              <ConfirmDialog
                tone="primary"
                trigger={
                  <Button type="button" variant="secondary">
                    <RotateCw /> {t("rotate")}
                  </Button>
                }
                title={t("rotateTitle")}
                description={t("rotateDescription")}
                confirmLabel={t("rotate")}
                onConfirm={() => set("rotate")}
              />
              <ConfirmDialog
                trigger={
                  <Button type="button" variant="ghost" className="text-fg-muted">
                    {t("disable")}
                  </Button>
                }
                title={t("disableTitle")}
                description={t("disableDescription")}
                confirmLabel={t("disable")}
                onConfirm={() => set("disable")}
              />
            </div>
          </>
        ) : (
          <div>
            <Button
              type="button"
              loading={pending}
              onClick={() => run(() => setWidgetIdentityAction(wsSlug, "enable"))}
            >
              {pending ? null : <KeyRound />} {t("enable")}
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
