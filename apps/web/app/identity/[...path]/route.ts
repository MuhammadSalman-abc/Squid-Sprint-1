import { createApiConfiguration, readWebEnvironment } from "@/config";

type IdentityRouteContext = Readonly<{ params: Promise<Readonly<{ path: string[] }>> }>;

const proxyIdentityRoute = async (request: Request, context: IdentityRouteContext): Promise<Response> => {
  const { path } = await context.params;
  const [operation, provider] = path;
  if (path.length !== 2 || (operation !== "sign-in" && operation !== "callback")
    || (provider !== "google" && provider !== "microsoft")) {
    return new Response(null, { status: 404 });
  }

  const api = createApiConfiguration(readWebEnvironment());
  const target = new URL(`/identity/${operation}/${provider}`, api.baseUrl);
  target.search = new URL(request.url).search;
  const cookie = request.headers.get("cookie");

  try {
    const upstream = await fetch(target, {
      ...(cookie ? { headers: { cookie } } : {}),
      cache: "no-store",
      redirect: "manual"
    });
    const headers = new Headers();
    const location = upstream.headers.get("location");
    if (location) headers.set("location", location);
    for (const setCookie of upstream.headers.getSetCookie()) headers.append("set-cookie", setCookie);
    return new Response(null, { status: upstream.status, headers });
  } catch {
    return new Response(null, { status: 503 });
  }
};

export const GET = proxyIdentityRoute;
