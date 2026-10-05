"use client";
import type { Role } from "@featherlog/core/client";
import { Crown, LogOut, Mail, RotateCw, Send, UserMinus, X } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/settings/confirm-dialog";
import { useActionRunner } from "@/components/settings/use-action";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import {
  changeRoleAction,
  inviteAction,
  leaveWorkspaceAction,
  removeMemberAction,
  resendInvitationAction,
  revokeInvitationAction,
  transferOwnershipAction,
} from "./actions";

export type MemberRow = {
  userId: string;
  name: string;
  displayName: string | null;
  email: string;
  image: string | null;
  role: Role;
  joinedAt: Date;
};

export type InvitationRow = {
  id: string;
  email: string;
  role: Role;
  expiresAt: Date;
  createdAt: Date;
};

const ROLE_TONE: Record<Role, "brand" | "warning" | "neutral"> = {
  owner: "warning",
  admin: "brand",
  editor: "neutral",
};

export function TeamManager({
  wsSlug,
  me,
  myRole,
  members,
  invitations,
}: {
  wsSlug: string;
  me: string;
  myRole: Role;
  members: MemberRow[];
  invitations: InvitationRow[];
}) {
  const t = useTranslations("settings.team");
  const isAdmin = myRole === "owner" || myRole === "admin";
  return (
    <div className="grid gap-6">
      {isAdmin ? <InviteForm wsSlug={wsSlug} myRole={myRole} /> : null}
      <Card>
        <CardHeader
          title={t("membersTitle", { count: members.length })}
          description={isAdmin ? t("membersDescription") : t("membersReadOnly")}
        />
        <ul className="divide-y divide-border">
          {members.map((m) => (
            <MemberItem key={m.userId} wsSlug={wsSlug} member={m} me={me} myRole={myRole} />
          ))}
        </ul>
      </Card>
      {isAdmin && invitations.length > 0 ? (
        <Card>
          <CardHeader title={t("pendingTitle")} description={t("pendingDescription")} />
          <ul className="divide-y divide-border">
            {invitations.map((inv) => (
              <InvitationItem key={inv.id} wsSlug={wsSlug} invitation={inv} />
            ))}
          </ul>
        </Card>
      ) : null}
      <RolesExplainer />
    </div>
  );
}

function InviteForm({ wsSlug, myRole }: { wsSlug: string; myRole: Role }) {
  const t = useTranslations("settings.team");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("editor");
  const { pending, errors, run } = useActionRunner();
  const roles: Role[] = myRole === "owner" ? ["editor", "admin", "owner"] : ["editor", "admin"];
  return (
    <Card>
      <CardHeader title={t("inviteTitle")} description={t("inviteDescription")} />
      <CardBody>
        <form
          noValidate
          className="flex flex-wrap items-start gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => inviteAction(wsSlug, { email: email.trim(), role }), {
              onSuccess: (d) => {
                toast.success(t("invited", { email: d.email }));
                setEmail("");
              },
            });
          }}
        >
          <Field
            label={t("email")}
            htmlFor="invite-email"
            error={errors.email}
            className="min-w-56 flex-1"
          >
            <Input
              id="invite-email"
              type="email"
              autoComplete="off"
              placeholder="name@company.com"
              value={email}
              aria-invalid={Boolean(errors.email)}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label={t("role")} htmlFor="invite-role" error={errors.role} className="w-40">
            <Select id="invite-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {roles.map((r) => (
                <option key={r} value={r}>
                  {t(`roles.${r}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" className="sm:mt-[26px]" loading={pending} disabled={!email.trim()}>
            {pending ? null : <Send />}
            {t("sendInvite")}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}

function MemberItem({
  wsSlug,
  member: m,
  me,
  myRole,
}: {
  wsSlug: string;
  member: MemberRow;
  me: string;
  myRole: Role;
}) {
  const t = useTranslations("settings.team");
  const format = useFormatter();
  const [pending, start] = useTransition();
  const [roleValue, setRoleValue] = useState<Role>(m.role);
  useEffect(() => setRoleValue(m.role), [m.role]);
  const isMe = m.userId === me;
  const isAdmin = myRole === "owner" || myRole === "admin";
  const canEdit = isAdmin && !isMe && (myRole === "owner" || m.role !== "owner");
  const roles: Role[] = myRole === "owner" ? ["owner", "admin", "editor"] : ["admin", "editor"];
  const displayName = m.displayName || m.name;

  return (
    <li className="flex flex-wrap items-center gap-3 px-5 py-3 sm:flex-nowrap">
      <Avatar name={displayName} image={m.image} size={36} />
      <div className="grid min-w-0 flex-1 gap-0.5">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{displayName}</span>
          {isMe ? <Badge>{t("you")}</Badge> : null}
        </div>
        <span className="truncate text-[13px] text-fg-muted">
          {m.email} ·{" "}
          {t("joined", { date: format.dateTime(new Date(m.joinedAt), { dateStyle: "medium" }) })}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        {canEdit ? (
          <Select
            aria-label={t("roleFor", { name: displayName })}
            value={roleValue}
            disabled={pending}
            className="h-8 w-32 text-[13px]"
            onChange={(e) => {
              const role = e.target.value as Role;
              setRoleValue(role);
              start(async () => {
                const res = await changeRoleAction(wsSlug, m.userId, role);
                if (!res.ok) {
                  setRoleValue(m.role);
                  toast.error(res.error);
                } else
                  toast.success(t("roleChanged", { name: displayName, role: t(`roles.${role}`) }));
              });
            }}
          >
            {roles.map((r) => (
              <option key={r} value={r}>
                {t(`roles.${r}`)}
              </option>
            ))}
          </Select>
        ) : (
          <Badge tone={ROLE_TONE[m.role]}>{t(`roles.${m.role}`)}</Badge>
        )}
        {myRole === "owner" && !isMe && m.role !== "owner" ? (
          <ConfirmDialog
            tone="primary"
            trigger={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 text-fg-muted"
                aria-label={t("transfer")}
                title={t("transfer")}
              >
                <Crown />
              </Button>
            }
            title={t("transferTitle", { name: displayName })}
            description={t("transferDescription", { name: displayName })}
            confirmLabel={t("transfer")}
            onConfirm={async () => {
              const res = await transferOwnershipAction(wsSlug, m.userId);
              if (!res.ok) {
                toast.error(res.error);
                return false;
              }
              toast.success(t("transferred", { name: displayName }));
            }}
          />
        ) : null}
        {canEdit ? (
          <ConfirmDialog
            trigger={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 text-fg-muted hover:text-danger"
                aria-label={t("remove")}
                title={t("remove")}
              >
                <UserMinus />
              </Button>
            }
            title={t("removeTitle", { name: displayName })}
            description={t("removeDescription")}
            confirmLabel={t("remove")}
            onConfirm={async () => {
              const res = await removeMemberAction(wsSlug, m.userId);
              if (!res.ok) {
                toast.error(res.error);
                return false;
              }
              toast.success(t("removed", { name: displayName }));
            }}
          />
        ) : null}
        {isMe ? (
          <ConfirmDialog
            trigger={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-fg-muted hover:text-danger"
              >
                <LogOut />
                {t("leave")}
              </Button>
            }
            title={t("leaveTitle")}
            description={m.role === "owner" ? t("leaveDescriptionOwner") : t("leaveDescription")}
            confirmLabel={t("leave")}
            onConfirm={async () => {
              const res = await leaveWorkspaceAction(wsSlug);
              if (res && !res.ok) {
                toast.error(res.error);
                return false;
              }
            }}
          />
        ) : null}
      </div>
    </li>
  );
}

function InvitationItem({
  wsSlug,
  invitation: inv,
}: {
  wsSlug: string;
  invitation: InvitationRow;
}) {
  const t = useTranslations("settings.team");
  const format = useFormatter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<"resend" | "revoke" | null>(null);

  const act = (kind: "resend" | "revoke") => {
    setBusy(kind);
    start(async () => {
      const res =
        kind === "resend"
          ? await resendInvitationAction(wsSlug, inv.id)
          : await revokeInvitationAction(wsSlug, inv.id);
      setBusy(null);
      if (!res.ok) return void toast.error(res.error);
      toast.success(
        kind === "resend" ? t("resent", { email: inv.email }) : t("revoked", { email: inv.email }),
      );
    });
  };

  return (
    <li className="flex flex-wrap items-center gap-3 px-5 py-3 sm:flex-nowrap">
      <span className="flex size-9 items-center justify-center rounded-full bg-muted text-fg-muted">
        <Mail className="size-4" />
      </span>
      <div className="grid min-w-0 flex-1 gap-0.5">
        <span className="truncate text-sm font-medium">{inv.email}</span>
        <span className="text-[13px] text-fg-muted">
          {t("expires", {
            date: format.dateTime(new Date(inv.expiresAt), { dateStyle: "medium" }),
          })}
        </span>
      </div>
      <Badge tone={ROLE_TONE[inv.role]}>{t(`roles.${inv.role}`)}</Badge>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        loading={busy === "resend"}
        disabled={pending}
        onClick={() => act("resend")}
      >
        {busy === "resend" ? null : <RotateCw />}
        {t("resend")}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-fg-muted hover:text-danger"
        loading={busy === "revoke"}
        disabled={pending}
        onClick={() => act("revoke")}
      >
        {busy === "revoke" ? null : <X />}
        {t("revoke")}
      </Button>
    </li>
  );
}

function RolesExplainer() {
  const t = useTranslations("settings.team");
  return (
    <Card>
      <CardHeader title={t("rolesTitle")} />
      <CardBody className="grid gap-3">
        {(["owner", "admin", "editor"] as const).map((r) => (
          <div key={r} className="flex items-start gap-3">
            <Badge tone={ROLE_TONE[r]} className="mt-0.5 w-16 justify-center">
              {t(`roles.${r}`)}
            </Badge>
            <p className="text-[13px] text-fg-muted">{t(`roles.${r}Description`)}</p>
          </div>
        ))}
      </CardBody>
    </Card>
  );
}
