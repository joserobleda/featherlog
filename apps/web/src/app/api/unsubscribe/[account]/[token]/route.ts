import { unsubscribeLink } from "@/server/newsletters/unsubscribe";

// RFC 8058 one-click unsubscribe: mail clients POST `List-Unsubscribe=One-Click` here.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ account: string; token: string }> },
) {
  const { account, token } = await params;
  const done = await unsubscribeLink(account, token);
  return new Response(done ? "Unsubscribed" : "Invalid link", {
    status: done ? 200 : 404,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
