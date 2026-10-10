import type { RequestHandler, Response } from "express";
import { performance } from "node:perf_hooks";
import { systemClock } from "@workspace/kernel";
import type { Clock } from "@workspace/kernel";
import type { IdentityProvider, SignInCompletionPort } from "../../identity/public.js";
import type { IdentitySignal } from "../../identity/public.js";
import type { SessionQueryPort } from "../../identity/public.js";
import { SESSION_LIFETIME_MS } from "../../identity/public.js";
import type { OidcFlowCookie, OidcProviderPort } from "../index.js";
import { OIDC_FLOW_COOKIE_NAME, OIDC_FLOW_COOKIE_TTL_SECONDS, SESSION_COOKIE_NAME } from "../index.js";
import { ERROR_CODES, ERROR_MESSAGES, HTTP_STATUS } from "../../../constants/index.js";
import { createApplicationError } from "../../../errors/index.js";

const parseProvider = (value: unknown): IdentityProvider | null =>
  value === "google" || value === "microsoft" ? value : null;

export type OidcSignInControllerDependencies = Readonly<{
  provider: OidcProviderPort;
  flowCookie: OidcFlowCookie;
  completion: SignInCompletionPort;
  callbackBaseUrl: string;
  webOrigin: string;
  secureCookies: boolean;
  clock?: Clock;
  sessions?: SessionQueryPort;
  resolveSession?: (cookieHeader: string | undefined) => Promise<Readonly<{ sessionId: string; userId: string }> | null>;
  invalidatePrincipalSession?: (sessionId: string) => void;
  recordInvalidSignIn?: () => void;
  recordSignInSignal?: (signal: Extract<IdentitySignal, { event: "identity.sign_in.completion" }>) => void;
}>;

const cookieValue = (header: string | undefined, name: string): string | undefined => {
  const matches = (header ?? "").split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${name}=`));
  if (matches.length !== 1) return undefined;
  return matches[0]?.slice(name.length + 1);
};

export const createOidcSignInController = ({
  provider,
  flowCookie,
  completion,
  callbackBaseUrl,
  webOrigin,
  secureCookies,
  clock = systemClock,
  sessions,
  resolveSession,
  invalidatePrincipalSession = () => undefined,
  recordInvalidSignIn = () => undefined,
  recordSignInSignal = () => undefined
}: OidcSignInControllerDependencies): Readonly<{
  start: RequestHandler;
  callback: RequestHandler;
  signOut: RequestHandler;
}> => {
  const callbackUri = (identityProvider: IdentityProvider): string =>
    `${callbackBaseUrl.replace(/\/$/, "")}/identity/callback/${identityProvider}`;

  const redirectToSignIn = (response: Response, error: "invalid-sign-in" | "provider-unavailable" | "account-closed"): void => {
    const destination = new URL("/sign-in", webOrigin);
    destination.searchParams.set("error", error);
    response.redirect(303, destination.href);
  };

  const start: RequestHandler = async (request, response, next) => {
    const identityProvider = parseProvider(request.params.provider);
    if (!identityProvider) {
      next(createApplicationError({
        code: ERROR_CODES.invalidSignIn,
        message: ERROR_MESSAGES.invalidSignIn,
        status: HTTP_STATUS.badRequest
      }));
      return;
    }

    try {
      const result = await provider.createAuthorizationRequest(identityProvider, callbackUri(identityProvider));
      if (result.kind === "provider-unavailable") {
        redirectToSignIn(response, "provider-unavailable");
        return;
      }

      response.cookie(OIDC_FLOW_COOKIE_NAME, flowCookie.seal(result.context), {
        httpOnly: true,
        secure: secureCookies,
        sameSite: "lax",
        path: "/identity/callback",
        maxAge: OIDC_FLOW_COOKIE_TTL_SECONDS * 1_000
      });
      response.redirect(303, result.authorizationUrl);
    } catch (error: unknown) {
      next(error);
    }
  };

  const callback: RequestHandler = async (request, response, next) => {
    const identityProvider = parseProvider(request.params.provider);
    if (!identityProvider) {
      redirectToSignIn(response, "invalid-sign-in");
      return;
    }

    response.clearCookie(OIDC_FLOW_COOKIE_NAME, {
      httpOnly: true,
      secure: secureCookies,
      sameSite: "lax",
      path: "/identity/callback"
    });

    const stateCookie = cookieValue(request.headers.cookie, OIDC_FLOW_COOKIE_NAME);
    const context = flowCookie.open(stateCookie, identityProvider);
    if (typeof request.query.error === "string") {
      const providerUnavailable = request.query.error === "temporarily_unavailable"
        || request.query.error === "server_error";
      redirectToSignIn(response, providerUnavailable ? "provider-unavailable" : "invalid-sign-in");
      return;
    }
    if (!context) {
      recordInvalidSignIn();
      redirectToSignIn(response, "invalid-sign-in");
      return;
    }

    try {
      const currentUrl = new URL(request.originalUrl, `${callbackBaseUrl.replace(/\/$/, "")}/`);
      const result = await provider.verifyCallback(identityProvider, currentUrl.href, callbackUri(identityProvider), context);
      if (result.kind === "provider-unavailable") {
        redirectToSignIn(response, "provider-unavailable");
        return;
      }
      if (result.kind === "invalid-sign-in") {
        recordInvalidSignIn();
        redirectToSignIn(response, "invalid-sign-in");
        return;
      }

      const completionStartedAt = performance.now();
      let completionResult: Awaited<ReturnType<SignInCompletionPort["complete"]>>;
      try {
        completionResult = await completion.complete(result.identity);
      } catch (error: unknown) {
        recordSignInSignal({
          event: "identity.sign_in.completion",
          module: "identity",
          operation: "sign_in.completion",
          workspaceId: null,
          outcome: "error",
          durationMs: performance.now() - completionStartedAt
        });
        throw error;
      }
      if (completionResult.kind === "account-closed") {
        recordSignInSignal({
          event: "identity.sign_in.completion",
          module: "identity",
          operation: "sign_in.completion",
          workspaceId: null,
          outcome: "error",
          durationMs: performance.now() - completionStartedAt
        });
        redirectToSignIn(response, "account-closed");
        return;
      }
      recordSignInSignal({
        event: "identity.sign_in.completion",
        module: "identity",
        operation: "sign_in.completion",
        workspaceId: completionResult.workspaceId,
        outcome: "success",
        durationMs: performance.now() - completionStartedAt
      });

      response.cookie(SESSION_COOKIE_NAME, completionResult.sessionToken, {
        httpOnly: true,
        secure: secureCookies,
        sameSite: "lax",
        path: "/",
        maxAge: SESSION_LIFETIME_MS
      });
      response.redirect(303, new URL("/workspace/organization", webOrigin).href);
    } catch (error: unknown) {
      next(error);
    }
  };

  const signOut: RequestHandler = async (request, response, next) => {
    try {
      const activeSession = await resolveSession?.(request.headers.cookie);
      if (activeSession && sessions) {
        await sessions.revokeActiveSession(activeSession.sessionId, activeSession.userId, new Date(clock.now()));
        invalidatePrincipalSession(activeSession.sessionId);
      }
      response.clearCookie(SESSION_COOKIE_NAME, {
        httpOnly: true,
        secure: secureCookies,
        sameSite: "lax",
        path: "/"
      });
      response.status(HTTP_STATUS.noContent).end();
    } catch (error: unknown) {
      next(error);
    }
  };

  return Object.freeze({ start, callback, signOut });
};
