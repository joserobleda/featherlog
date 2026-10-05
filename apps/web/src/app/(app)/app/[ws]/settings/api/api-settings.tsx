"use client";
import { SCOPES, type Scope } from "@featherlog/core/client";
import { Bot, ExternalLink, KeyRound, Plus } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { ConfirmDialog } from "@/components/settings/confirm-dialog";
import { CodeBlock, CopyField } from "@/components/settings/copy-field";
import { useActionRunner } from "@/components/settings/use-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { SwitchRow } from "@/components/ui/switch";
import {
  createApiKeyAction,
  revokeApiKeyAction,
  revokeAppAction,
  setIntegrationsCanPublishAction,
} from "./actions";

type Key = {
  id: string;
  name: string;
  prefix: string;
  scopes: Scope[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
};
type App = { clientId: string; name: string; scopes: string[]; authorizedAt: string };

const DEFAULT_SCOPES: Scope[] = ["posts:read", "posts:write", "assets:write"];

export function ApiSettings(props: {
  workspace: string;
  integrationsCanPublish: boolean;
  appUrl: string;
  keys: Key[];
  apps: App[];
}) {
  const t = useTranslations("settings.api");
  const format = useFormatter();
  const { pending, run } = useActionRunner();
  const [canPublish, setCanPublish] = useState(props.integrationsCanPublish);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<Scope[]>(DEFAULT_SCOPES);
  const [expires, setExpires] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const mcpUrl = `${props.appUrl}/mcp`;
  const date = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "medium" });

  return (
    <div className="grid grid-cols-1 gap-6">
      <Card>
        <CardBody>
          <SwitchRow
            id="integrations-can-publish"
            label={t("publishing.title")}
            description={t("publishing.description")}
            checked={canPublish}
            disabled={pending}
            onCheckedChange={(v) => {
              setCanPublish(v);
              run(() => setIntegrationsCanPublishAction(props.workspace, v), {
                success: t("publishing.title"),
                onError: () => setCanPublish(!v),
              });
            }}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={t("keys.title")}
          description={t("keys.description")}
          actions={
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus /> {t("keys.create")}
            </Button>
          }
        />
        {props.keys.length === 0 ? (
          <CardBody className="text-sm text-fg-muted">{t("keys.empty")}</CardBody>
        ) : (
          <ul className="divide-y divide-border">
            {props.keys.map((k) => (
              <li key={k.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <KeyRound className="size-4 text-fg-muted" />
                <div className="grid min-w-0 flex-1 gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{k.name}</span>
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{k.prefix}…</code>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {k.scopes.map((s) => (
                      <Badge key={s} className="text-[11px]">
                        {t(`keys.scopeNames.${s}`)}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-xs text-fg-muted">
                    {t("keys.created", { date: date(k.createdAt) })} ·{" "}
                    {k.lastUsedAt
                      ? t("keys.lastUsed", { date: date(k.lastUsedAt) })
                      : t("keys.neverUsed")}
                    {k.expiresAt ? ` · ${t("keys.expires")} ${date(k.expiresAt)}` : ""}
                  </p>
                </div>
                <ConfirmDialog
                  trigger={
                    <Button variant="ghost" size="sm" className="text-danger">
                      {t("keys.revoke")}
                    </Button>
                  }
                  title={t("keys.revoke")}
                  description={t("keys.revokeConfirm")}
                  confirmLabel={t("keys.revoke")}
                  onConfirm={() =>
                    run(() => revokeApiKeyAction(props.workspace, k.id), {
                      success: t("keys.revoked"),
                    })
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title={t("mcp.title")} description={t("mcp.description")} />
        <CardBody className="grid grid-cols-1 gap-5 text-sm">
          <Field label={t("mcp.url")}>
            <CopyField value={mcpUrl} aria-label={t("mcp.url")} />
          </Field>
          <div className="grid min-w-0 grid-cols-1 gap-1.5">
            <p className="font-medium">{t("mcp.claudeTitle")}</p>
            <p className="text-fg-muted">{t("mcp.claude")}</p>
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-1.5">
            <p className="font-medium">{t("mcp.claudeCodeTitle")}</p>
            <CodeBlock code={`claude mcp add --transport http featherlog ${mcpUrl}`} />
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-1.5">
            <p className="font-medium">{t("mcp.cursorTitle")}</p>
            <CodeBlock
              code={JSON.stringify(
                {
                  mcpServers: {
                    featherlog: { url: mcpUrl, headers: { Authorization: "Bearer fl_live_…" } },
                  },
                },
                null,
                2,
              )}
            />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={t("rest.title")}
          description={t("rest.description")}
          actions={
            <Button asChild variant="secondary" size="sm">
              <a href="/api/docs" target="_blank" rel="noreferrer">
                <ExternalLink /> {t("rest.docs")}
              </a>
            </Button>
          }
        />
        <CardBody className="grid grid-cols-1 gap-1.5 text-sm">
          <p className="text-fg-muted">{t("rest.example")}</p>
          <CodeBlock
            code={`curl -X POST ${props.appUrl}/api/v1/posts \\\n  -H "Authorization: Bearer fl_live_…" \\\n  -H "Content-Type: application/json" \\\n  -H "Idempotency-Key: $(uuidgen)" \\\n  -d '{"translations":{"en":{"title":"Dark mode","contentMd":"[New]\\n\\nSwitch themes from your profile."}}}'`}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t("apps.title")} description={t("apps.description")} />
        {props.apps.length === 0 ? (
          <CardBody className="text-sm text-fg-muted">{t("apps.empty")}</CardBody>
        ) : (
          <ul className="divide-y divide-border">
            {props.apps.map((a) => (
              <li key={a.clientId} className="flex items-center gap-3 px-5 py-3">
                <Bot className="size-4 text-fg-muted" />
                <div className="grid flex-1 gap-0.5">
                  <span className="font-medium">{a.name}</span>
                  <span className="text-xs text-fg-muted">
                    {t("apps.authorized", { date: date(a.authorizedAt) })}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-danger"
                  disabled={pending}
                  onClick={() =>
                    run(() => revokeAppAction(props.workspace, a.clientId), {
                      success: t("apps.revoked"),
                    })
                  }
                >
                  {t("apps.revoke")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Dialog
        open={open || !!secret}
        onOpenChange={(v) => {
          if (!v) {
            setOpen(false);
            setSecret(null);
          }
        }}
      >
        {secret ? (
          <DialogContent title={t("keys.secretTitle")} description={t("keys.secretDescription")}>
            <CopyField value={secret} aria-label={t("keys.secretTitle")} />
            <div className="flex justify-end">
              <Button
                onClick={() => {
                  setSecret(null);
                  setOpen(false);
                }}
              >
                {t("keys.done")}
              </Button>
            </div>
          </DialogContent>
        ) : (
          <DialogContent title={t("keys.create")}>
            <form
              className="grid gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                run(
                  () =>
                    createApiKeyAction(props.workspace, {
                      name,
                      scopes,
                      expiresInDays: expires ? Number(expires) : null,
                    }),
                  {
                    onSuccess: (data) => {
                      setSecret(data.secret);
                      setName("");
                      setScopes(DEFAULT_SCOPES);
                    },
                  },
                );
              }}
            >
              <Field label={t("keys.name")} htmlFor="key-name">
                <Input
                  id="key-name"
                  required
                  value={name}
                  placeholder={t("keys.namePlaceholder")}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
              <fieldset className="grid gap-2">
                <legend className="mb-1 text-sm font-medium">{t("keys.scopes")}</legend>
                {SCOPES.map((s) => (
                  <label key={s} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={scopes.includes(s)}
                      onChange={(e) =>
                        setScopes((prev) =>
                          e.target.checked ? [...prev, s] : prev.filter((x) => x !== s),
                        )
                      }
                    />
                    {t(`keys.scopeNames.${s}`)} <code className="text-xs text-fg-muted">{s}</code>
                  </label>
                ))}
              </fieldset>
              <Field label={t("keys.expires")} htmlFor="key-expires">
                <Select
                  id="key-expires"
                  value={expires}
                  onChange={(e) => setExpires(e.target.value)}
                >
                  <option value="">{t("keys.never")}</option>
                  {[30, 90, 365].map((d) => (
                    <option key={d} value={d}>
                      {t("keys.days", { count: d })}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="flex justify-end">
                <Button type="submit" loading={pending} disabled={!name || scopes.length === 0}>
                  {t("keys.create")}
                </Button>
              </div>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
