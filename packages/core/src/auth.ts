import type { DbOrTx } from "@featherlog/db";
import { AppError, forbidden } from "./errors";

export const ROLES = ["owner", "admin", "editor"] as const;
export type Role = (typeof ROLES)[number];

export const SCOPES = [
  "posts:read",
  "posts:write",
  "posts:publish",
  "categories:write",
  "assets:write",
  "settings:write",
  "members:admin",
] as const;
export type Scope = (typeof SCOPES)[number];

/** Internal permissions; scopes map 1:1, plus `posts:write_any` (edit other people's posts). */
export type Permission = Scope | "posts:write_any" | "workspace:delete" | "workspace:transfer";

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: [...SCOPES, "posts:write_any", "workspace:delete", "workspace:transfer"],
  admin: [...SCOPES, "posts:write_any"],
  editor: ["posts:read", "posts:write", "posts:publish", "assets:write"],
};

/** Where a change originated. Stored on posts as `created_via`. */
export type Via = "panel" | "api" | "mcp";

export type Actor =
  | { kind: "user"; userId: string; role: Role; scopes?: Scope[]; label?: string }
  | { kind: "api_key"; apiKeyId: string; scopes: Scope[]; label: string };

/**
 * Everything a domain service needs: the database, the workspace it acts on,
 * who is acting and through which entry point.
 */
export type Ctx = {
  db: DbOrTx;
  workspaceId: string;
  actor: Actor;
  via: Via;
};

export function permissionsOf(actor: Actor): Set<Permission> {
  if (actor.kind === "api_key") {
    const perms = new Set<Permission>(actor.scopes);
    // An API key acts on behalf of the workspace, so writing means writing any post.
    if (perms.has("posts:write")) perms.add("posts:write_any");
    return perms;
  }
  const base = new Set<Permission>(ROLE_PERMISSIONS[actor.role]);
  if (!actor.scopes) return base;
  // OAuth/MCP sessions: intersection of the user's role and the granted scopes.
  const granted = new Set<Permission>(actor.scopes);
  if (granted.has("posts:write")) granted.add("posts:write_any");
  return new Set([...base].filter((p) => granted.has(p)));
}

export function can(actor: Actor, perm: Permission): boolean {
  return permissionsOf(actor).has(perm);
}

export function assertCan(ctx: Pick<Ctx, "actor">, perm: Permission) {
  if (!can(ctx.actor, perm)) throw forbidden(`Missing permission: ${perm}`);
}

export function actorUserId(actor: Actor): string | null {
  return actor.kind === "user" ? actor.userId : null;
}

export function actorLabel(actor: Actor): string | null {
  return actor.label ?? null;
}

export function requireUser(actor: Actor): string {
  if (actor.kind !== "user") throw new AppError("forbidden", "This action requires a user session");
  return actor.userId;
}

export type { DbOrTx };
