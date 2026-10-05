import { schema } from "@featherlog/db";
import { findInvitation } from "@featherlog/core";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";
import { count, eq } from "drizzle-orm";
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
      .where(eq(schema.invitations.email, email.toLowerCase()));
    if (pending) return;
  }
  throw new APIError("FORBIDDEN", { message: "Sign-ups are disabled on this instance." });
}

export const auth = betterAuth({
  appName: "Featherlog",
  baseURL: env.APP_URL,
  secret: env.AUTH_SECRET,
  trustedOrigins: [env.APP_URL],
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
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
          const inviteToken = (ctx?.body as { inviteToken?: string } | undefined)?.inviteToken ?? null;
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
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
