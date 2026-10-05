// Only used to generate the Drizzle schema for Better Auth plugin tables:
//   npx auth generate --config scripts/auth-schema.config.ts --adapter drizzle --dialect postgresql
import { cimd } from "@better-auth/cimd";
import { mcp } from "@better-auth/mcp";
import { betterAuth } from "better-auth";
import { jwt, magicLink } from "better-auth/plugins";

export const auth = betterAuth({
  baseURL: "http://localhost:3100",
  user: {
    additionalFields: {
      displayName: { type: "string", required: false },
      jobTitle: { type: "string", required: false },
      uiLocale: { type: "string", required: false },
    },
  },
  emailAndPassword: { enabled: true },
  plugins: [
    magicLink({ sendMagicLink: async () => {} }),
    jwt(),
    mcp({
      resource: "http://localhost:3100/mcp",
      loginPage: "/login",
      consentPage: "/oauth/consent",
    }),
    cimd({
      fetchClientMetadataResource: async () => new Response(),
      metadataProfile: "mcp-2026-07-28",
    }),
  ],
});
