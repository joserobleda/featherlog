import { type DbOrTx, postImports } from "@featherlog/db";
import { and, eq } from "drizzle-orm";

/** Post previously created from an external item (source + id), if any. */
export async function findImportedPost(
  db: DbOrTx,
  workspaceId: string,
  source: string,
  externalId: string,
) {
  const [row] = await db
    .select({ postId: postImports.postId, locale: postImports.locale })
    .from(postImports)
    .where(
      and(
        eq(postImports.workspaceId, workspaceId),
        eq(postImports.source, source),
        eq(postImports.externalId, externalId),
      ),
    );
  return row ?? null;
}

export async function recordImport(
  db: DbOrTx,
  input: {
    workspaceId: string;
    source: string;
    externalId: string;
    postId: string;
    locale: string;
  },
) {
  await db.insert(postImports).values(input).onConflictDoNothing();
}
