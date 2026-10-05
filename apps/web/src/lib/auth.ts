import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { mcp } from "@better-auth/mcp";
import { findInvitation, SCOPES } from "@featherlog/core";
import { schema } from "@featherlog/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { jwt, magicLink } from "better-auth/plugins";
import { and, count, eq, gt } from "drizzle-orm";
import { db } from "./db";
import { magicLinkEmail, resetPasswordEmail, verifyEmail } from "./emails";
import { env } from "./env";
import { sendMailSafe } from "./mailer";

/**
 * Sign-up policy:
 *  - the very first user can always sign up (they become the instance admin by creating a workspace);
 *  - `open`: anyone; `invite`: only emails with a pending invitation; `closed`: nobody else.
 */
async function assertSignupAllowed(email: string, inviteToken?: string | null) {
  const [{ value: users } = { value: 0 }] = await db.select({ value: count() }).from(schema.user);
  if (users === 0 || env.SIGNUP_MODE === "open") return;
  if (env.SIGNUP_MODE === "invite") {
    if (inviteToken) {
      const inv = await findInvitation(db, inviteToken);
      if (inv && inv.invitation.email === email.toLowerCase()) return;
    }
    const [pending] = await db
      .select({ id: schema.invitations.id })
      .from(schema.invitations)
      .where(
        and(
          eq(schema.invitations.email, email.toLowerCase()),
          eq(schema.invitations.status, "pending"),
          gt(schema.invitations.expiresAt, new Date()),
        ),
      );
    if (pending) return;
  }
  throw new APIError("FORBIDDEN", { message: "Sign-ups are disabled on this instance." });
}

/** Canonical MCP protected-resource URL (tokens are audience-bound to it). */
export const MCP_RESOURCE = `${env.APP_URL}/mcp`;
export const OAUTH_BASE_SCOPES = ["openid", "profile", "email", "offline_access"] as const;

export const auth = betterAuth({
  appName: "Featherlog",
  baseURL: env.APP_URL,
  secret: env.AUTH_SECRET,
  trustedOrigins: [env.APP_URL],
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  user: {
    additionalFields: {
      displayName: { type: "string", required: false, input: true },
      jobTitle: { type: "string", required: false, input: true },
      uiLocale: { type: "string", required: false, input: true },
    },
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    requireEmailVerification: env.NODE_ENV === "production",
    sendResetPassword: async ({ user, url }) => {
      await sendMailSafe(resetPasswordEmail(user.email, url));
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendMailSafe(verifyEmail(user.email, url));
    },
  },
  socialProviders: env.googleEnabled
    ? { google: { clientId: env.GOOGLE_CLIENT_ID!, clientSecret: env.GOOGLE_CLIENT_SECRET! } }
    : undefined,
  account: { accountLinking: { enabled: true, trustedProviders: ["google"] } },
  session: { cookieCache: { enabled: true, maxAge: 60 } },
  rateLimit: { enabled: env.NODE_ENV === "production", window: 60, max: 100 },
  databaseHooks: {
    user: {
      create: {
        before: async (user, ctx) => {
          const inviteToken =
            (ctx?.body as { inviteToken?: string } | undefined)?.inviteToken ?? null;
          await assertSignupAllowed(user.email, inviteToken);
          return { data: user };
        },
      },
    },
  },
  plugins: [
    magicLink({
      expiresIn: 600,
      sendMagicLink: async ({ email, url }) => {
        await sendMailSafe(magicLinkEmail(email, url));
      },
    }),
    // OAuth 2.1 authorization server for MCP clients (Claude, ChatGPT, Cursor…).
    jwt(),
    mcp({
      resource: MCP_RESOURCE,
      loginPage: "/login",
      consentPage: "/oauth/consent",
      scopes: [...OAUTH_BASE_SCOPES, ...SCOPES],
      // Most MCP clients still register dynamically (RFC 7591); CIMD covers 2026-era clients.
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
    }),
    cimd({ fetchClientMetadataResource, metadataProfile: "mcp-2026-07-28" }),
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
