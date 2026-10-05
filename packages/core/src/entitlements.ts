import type { Workspace } from "./workspaces";

export type Feature =
  | "whitelabel"
  | "custom_domain"
  | "team"
  | "private_mode"
  | "multiple_locales"
  | "api"
  | "scheduled_publishing";

export type EntitlementsResolver = (workspace: Pick<Workspace, "id">, feature: Feature) => boolean;

/** Self-hosted: everything is enabled. A hosted edition can swap the resolver for plan-based checks. */
let resolver: EntitlementsResolver = () => true;

export function setEntitlementsResolver(fn: EntitlementsResolver) {
  resolver = fn;
}

export function hasFeature(workspace: Pick<Workspace, "id">, feature: Feature) {
  return resolver(workspace, feature);
}
