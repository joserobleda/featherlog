import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () => ts("created_at").notNull().defaultNow();
const updatedAt = () => ts("updated_at").notNull().defaultNow();

/* ------------------------------------------------------------------ */
/* Auth (tables managed by Better Auth — field names follow its model) */
/* ------------------------------------------------------------------ */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  displayName: text("display_name"),
  jobTitle: text("job_title"),
  uiLocale: text("ui_locale"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: ts("expires_at").notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: ts("access_token_expires_at"),
    refreshTokenExpiresAt: ts("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: ts("expires_at").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

/* ------------------------------------------------------------------ */
/* Workspaces & team                                                   */
/* ------------------------------------------------------------------ */

export const workspaces = pgTable("workspaces", {
  id: text("id").primaryKey(),
  /** Public account id used by the widget snippet (`account: "..."`). */
  publicId: text("public_id").notNull().unique(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  logoUrl: text("logo_url"),
  websiteUrl: text("website_url"),
  accentColor: text("accent_color").notNull().default("#3778FF"),
  terminology: text("terminology").notNull().default("changelog"),
  whitelabel: boolean("whitelabel").notNull().default(false),
  showAuthors: boolean("show_authors").notNull().default(true),
  noindex: boolean("noindex").notNull().default(false),
  privateMode: boolean("private_mode").notNull().default(false),
  defaultLocale: text("default_locale").notNull().default("en"),
  locales: text("locales").array().notNull().default(sql`ARRAY['en']::text[]`),
  missingTranslation: text("missing_translation").notNull().default("fallback"),
  integrationsCanPublish: boolean("integrations_can_publish").notNull().default(false),
  customDomain: text("custom_domain").unique(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const memberships = pgTable(
  "memberships",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.userId] }),
    index("memberships_user_idx").on(t.userId),
  ],
);

export const invitations = pgTable(
  "invitations",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    status: text("status").notNull().default("pending"),
    invitedBy: text("invited_by").references(() => user.id, { onDelete: "set null" }),
    expiresAt: ts("expires_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("invitations_workspace_idx").on(t.workspaceId)],
);

export const slugRedirects = pgTable("slug_redirects", {
  oldSlug: text("old_slug").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
});

/* ------------------------------------------------------------------ */
/* Content                                                             */
/* ------------------------------------------------------------------ */

export const categories = pgTable(
  "categories",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    color: text("color").notNull(),
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("categories_workspace_idx").on(t.workspaceId, t.position)],
);

export const categoryTranslations = pgTable(
  "category_translations",
  {
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    locale: text("locale").notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
  },
  (t) => [primaryKey({ columns: [t.categoryId, t.locale] })],
);

export const posts = pgTable(
  "posts",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    publicId: text("public_id").notNull().unique(),
    authorId: text("author_id").references(() => user.id, { onDelete: "set null" }),
    published: boolean("published").notNull().default(false),
    publishedAt: ts("published_at"),
    createdVia: text("created_via").notNull().default("panel"),
    actorLabel: text("actor_label"),
    /** Incremented on every change; exposed as ETag for optimistic concurrency. */
    version: integer("version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: ts("deleted_at"),
  },
  (t) => [index("posts_feed_idx").on(t.workspaceId, t.published, t.publishedAt)],
);

export const postTranslations = pgTable(
  "post_translations",
  {
    postId: text("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    locale: text("locale").notNull(),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    contentMd: text("content_md").notNull().default(""),
    contentHtml: text("content_html").notNull().default(""),
    text: text("text").notNull().default(""),
    excerpt: text("excerpt").notNull().default(""),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.postId, t.locale] })],
);

export const postCategories = pgTable(
  "post_categories",
  {
    postId: text("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.postId, t.categoryId] }),
    index("post_categories_category_idx").on(t.categoryId),
  ],
);

export const assets = pgTable(
  "assets",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull().unique(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    width: integer("width"),
    height: integer("height"),
    uploadedBy: text("uploaded_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("assets_workspace_idx").on(t.workspaceId)],
);

export const widgetSettings = pgTable("widget_settings", {
  workspaceId: text("workspace_id")
    .primaryKey()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  accentColor: text("accent_color"),
  badgeDelay: integer("badge_delay").notNull().default(0),
  entriesLimit: integer("entries_limit").notNull().default(5),
  expireAfterDays: integer("expire_after_days"),
  softHide: boolean("soft_hide").notNull().default(true),
  eyecatcher: text("eyecatcher").notNull().default("on"),
  /** Per-locale overrides of the widget UI strings: { es: { title: "..." } } */
  uiStrings: jsonb("ui_strings")
    .$type<Record<string, Record<string, string>>>()
    .notNull()
    .default({}),
  updatedAt: updatedAt(),
});

/* ------------------------------------------------------------------ */
/* API / integrations                                                  */
/* ------------------------------------------------------------------ */

export const apiKeys = pgTable(
  "api_keys",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    prefix: text("prefix").notNull(),
    hash: text("hash").notNull().unique(),
    scopes: text("scopes").array().notNull(),
    lastUsedAt: ts("last_used_at"),
    expiresAt: ts("expires_at"),
    revokedAt: ts("revoked_at"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("api_keys_workspace_idx").on(t.workspaceId)],
);

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    principal: text("principal").notNull(),
    key: text("key").notNull(),
    requestHash: text("request_hash").notNull(),
    status: integer("status").notNull(),
    response: jsonb("response"),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.principal, t.key] }),
    index("idempotency_created_idx").on(t.createdAt),
  ],
);

/** Content imported from other tools (e.g. Headway), so imports can be re-run without duplicates. */
export const postImports = pgTable(
  "post_imports",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** e.g. `headway:nailted-changelog` */
    source: text("source").notNull(),
    externalId: text("external_id").notNull(),
    postId: text("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    locale: text("locale").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.source, t.externalId] }),
    index("post_imports_post_idx").on(t.postId),
  ],
);

/** Transactional outbox of domain events (webhooks/integrations consume it later). */
export const events = pgTable(
  "events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("events_workspace_idx").on(t.workspaceId, t.id)],
);
