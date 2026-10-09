import application from "../servers/api/server.mts";
import type { IncomingMessage, ServerResponse } from "node:http";

const originalPathParameter = "__vercel_original_path";

const handler = (request: IncomingMessage, response: ServerResponse): void => {
  const rewrittenUrl = new URL(request.url ?? "/", "http://vercel.local");
  const originalPath = rewrittenUrl.searchParams.get(originalPathParameter);

  if (originalPath) {
    rewrittenUrl.searchParams.delete(originalPathParameter);
    request.url = `${originalPath}${rewrittenUrl.search}`;
  }

  const expressHandler = application as unknown as (
    request: IncomingMessage,
    response: ServerResponse
  ) => void;
  expressHandler(request, response);
};

export default handler;
