import { type DbOrTx, oauthClient, oauthConsent, oauthRefreshToken } from "@featherlog/db";
import { and, desc, eq, isNull } from "drizzle-orm";

/** OAuth applications (e.g. MCP clients) the user has authorized. */
export async function listAuthorizedApps(db: DbOrTx, userId: string) {
  return db
    .select({
      clientId: oauthConsent.clientId,
      name: oauthClient.name,
      icon: oauthClient.icon,
      uri: oauthClient.uri,
      scopes: oauthConsent.scopes,
      authorizedAt: oauthConsent.createdAt,
    })
    .from(oauthConsent)
    .innerJoin(oauthClient, eq(oauthClient.clientId, oauthConsent.clientId))
    .where(eq(oauthConsent.userId, userId))
    .orderBy(desc(oauthConsent.createdAt));
}

/**
 * Revokes an application's access: removes the consent and revokes its refresh tokens.
 * Already-issued access tokens are short-lived JWTs and expire within the hour.
 */
export async function revokeAuthorizedApp(db: DbOrTx, userId: string, clientId: string) {
  await db
    .delete(oauthConsent)
    .where(and(eq(oauthConsent.userId, userId), eq(oauthConsent.clientId, clientId)));
  await db
    .update(oauthRefreshToken)
    .set({ revoked: new Date() })
    .where(
      and(
        eq(oauthRefreshToken.userId, userId),
        eq(oauthRefreshToken.clientId, clientId),
        isNull(oauthRefreshToken.revoked),
      ),
    );
}
