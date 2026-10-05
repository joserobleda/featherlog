import { auth } from "@/lib/auth";
import { env } from "@/lib/env";

// RFC 8414 discovery at the origin root (incl. the path-inserted form for the "/api/auth" issuer).
export function GET() {
  return auth.handler(new Request(`${env.APP_URL}/api/auth/.well-known/openid-configuration`));
}
