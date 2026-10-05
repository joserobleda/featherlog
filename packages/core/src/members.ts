import { type DbOrTx, invitations, memberships, user, workspaces } from "@featherlog/db";
import { and, asc, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { assertCan, type Ctx, ROLES, type Role, requireUser } from "./auth";
import { randomToken, sha256 } from "./crypto";
import { AppError, forbidden, notFound } from "./errors";
import { newId } from "./ids";

const INVITE_TTL_DAYS = 14;

export const InviteInput = z.object({
  email: z.email().transform((e) => e.toLowerCase()),
  role: z.enum(ROLES).default("editor"),
});

export async function listMembers(db: DbOrTx, workspaceId: string) {
  return db
    .select({
      userId: user.id,
      name: user.name,
      displayName: user.displayName,
      email: user.email,
      image: user.image,
      jobTitle: user.jobTitle,
      role: memberships.role,
      joinedAt: memberships.createdAt,
    })
    .from(memberships)
    .innerJoin(user, eq(user.id, memberships.userId))
    .where(eq(memberships.workspaceId, workspaceId))
    .orderBy(asc(memberships.createdAt));
}

export async function listInvitations(ctx: Ctx) {
  assertCan(ctx, "members:admin");
  return ctx.db
    .select({
      id: invitations.id,
      email: invitations.email,
      role: invitations.role,
      status: invitations.status,
      expiresAt: invitations.expiresAt,
      createdAt: invitations.createdAt,
    })
    .from(invitations)
    .where(and(eq(invitations.workspaceId, ctx.workspaceId), eq(invitations.status, "pending")))
    .orderBy(asc(invitations.createdAt));
}

function assertMayGrant(ctx: Ctx, role: Role) {
  if (role === "owner" && !(ctx.actor.kind === "user" && ctx.actor.role === "owner")) {
    throw forbidden("Only owners can grant the owner role");
  }
}

/** Creates (or refreshes) an invitation. Returns the plaintext token to email — it is not stored. */
export async function inviteMember(ctx: Ctx, raw: z.input<typeof InviteInput>) {
  assertCan(ctx, "members:admin");
  const input = InviteInput.parse(raw);
  assertMayGrant(ctx, input.role);
  const [existingMember] = await ctx.db
    .select({ id: user.id })
    .from(memberships)
    .innerJoin(user, eq(user.id, memberships.userId))
    .where(and(eq(memberships.workspaceId, ctx.workspaceId), eq(user.email, input.email)));
  if (existingMember) throw new AppError("conflict", "This person is already a member", { field: "email" });

  await ctx.db
    .update(invitations)
    .set({ status: "revoked" })
    .where(
      and(
        eq(invitations.workspaceId, ctx.workspaceId),
        eq(invitations.email, input.email),
        eq(invitations.status, "pending"),
      ),
    );
  const token = randomToken(40);
  const [inv] = await ctx.db
    .insert(invitations)
    .values({
      id: newId(),
      workspaceId: ctx.workspaceId,
      email: input.email,
      role: input.role,
      tokenHash: sha256(token),
      invitedBy: ctx.actor.kind === "user" ? ctx.actor.userId : null,
      expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000),
    })
    .returning();
  return { invitation: inv!, token };
}

export async function revokeInvitation(ctx: Ctx, invitationId: string) {
  assertCan(ctx, "members:admin");
  await ctx.db
    .update(invitations)
    .set({ status: "revoked" })
    .where(and(eq(invitations.id, invitationId), eq(invitations.workspaceId, ctx.workspaceId)));
}

/** Looks up a pending, non-expired invitation by its plaintext token. */
export async function findInvitation(db: DbOrTx, token: string) {
  const [row] = await db
    .select({ invitation: invitations, workspace: { id: workspaces.id, name: workspaces.name, slug: workspaces.slug } })
    .from(invitations)
    .innerJoin(workspaces, eq(workspaces.id, invitations.workspaceId))
    .where(
      and(
        eq(invitations.tokenHash, sha256(token)),
        eq(invitations.status, "pending"),
        gt(invitations.expiresAt, new Date()),
      ),
    );
  return row ?? null;
}

export async function acceptInvitation(db: DbOrTx, token: string, userId: string) {
  const found = await findInvitation(db, token);
  if (!found) throw new AppError("not_found", "This invitation is invalid or has expired");
  await db
    .insert(memberships)
    .values({ workspaceId: found.invitation.workspaceId, userId, role: found.invitation.role })
    .onConflictDoNothing();
  await db.update(invitations).set({ status: "accepted" }).where(eq(invitations.id, found.invitation.id));
  return found.workspace;
}

async function ownersCount(db: DbOrTx, workspaceId: string) {
  const rows = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.role, "owner")));
  return rows.length;
}

async function getMember(db: DbOrTx, workspaceId: string, userId: string) {
  const [m] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.userId, userId)));
  if (!m) throw notFound("Member");
  return m;
}

export async function changeMemberRole(ctx: Ctx, userId: string, role: Role) {
  assertCan(ctx, "members:admin");
  if (!ROLES.includes(role)) throw new AppError("validation", "Invalid role");
  const member = await getMember(ctx.db, ctx.workspaceId, userId);
  assertMayGrant(ctx, role);
  if (member.role === "owner") {
    assertMayGrant(ctx, "owner");
    if (role !== "owner" && (await ownersCount(ctx.db, ctx.workspaceId)) <= 1) {
      throw new AppError("conflict", "A workspace needs at least one owner");
    }
  }
  await ctx.db
    .update(memberships)
    .set({ role })
    .where(and(eq(memberships.workspaceId, ctx.workspaceId), eq(memberships.userId, userId)));
}

export async function removeMember(ctx: Ctx, userId: string) {
  const self = ctx.actor.kind === "user" && ctx.actor.userId === userId;
  if (!self) assertCan(ctx, "members:admin");
  const member = await getMember(ctx.db, ctx.workspaceId, userId);
  if (member.role === "owner") {
    if (!self) assertMayGrant(ctx, "owner");
    if ((await ownersCount(ctx.db, ctx.workspaceId)) <= 1) {
      throw new AppError("conflict", "Transfer ownership before leaving: a workspace needs at least one owner");
    }
  }
  await ctx.db
    .delete(memberships)
    .where(and(eq(memberships.workspaceId, ctx.workspaceId), eq(memberships.userId, userId)));
}

export async function transferOwnership(ctx: Ctx, toUserId: string) {
  assertCan(ctx, "workspace:transfer");
  const me = requireUser(ctx.actor);
  await getMember(ctx.db, ctx.workspaceId, toUserId);
  await ctx.db
    .update(memberships)
    .set({ role: "owner" })
    .where(and(eq(memberships.workspaceId, ctx.workspaceId), eq(memberships.userId, toUserId)));
  if (me !== toUserId) {
    await ctx.db
      .update(memberships)
      .set({ role: "admin" })
      .where(and(eq(memberships.workspaceId, ctx.workspaceId), eq(memberships.userId, me)));
  }
}
