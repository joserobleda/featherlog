import { api } from "@/server/api/app";

export const dynamic = "force-dynamic";

const handler = (req: Request) => api.fetch(req);

export {
  handler as DELETE,
  handler as GET,
  handler as OPTIONS,
  handler as PATCH,
  handler as POST,
  handler as PUT,
};
