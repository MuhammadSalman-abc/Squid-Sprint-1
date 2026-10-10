import { createHash } from "node:crypto";
import { systemClock } from "@workspace/kernel";
import type { Clock } from "@workspace/kernel";
import type { ActiveSession, SessionQueryPort } from "../identity/public.js";

export const SESSION_COOKIE_NAME = "workspace_session";

export type SessionCookieResolver = ((cookieHeader: string | undefined) => Promise<ActiveSession | null>) & Readonly<{
  invalidateSession: (sessionId: string) => void;
}>;

type SessionCookieResolverDependencies = Readonly<{
  sessions: SessionQueryPort;
  clock?: Clock;
  cacheTtlMs?: number;
}>;

const getSessionToken = (cookieHeader: string | undefined): string | null => {
  if (!cookieHeader) return null;

  const values = cookieHeader.split(";")
    .map((cookie) => cookie.trim())
    .filter((cookie) => cookie.startsWith(`${SESSION_COOKIE_NAME}=`));
  if (values.length !== 1) return null;

  const token = values[0]?.slice(SESSION_COOKIE_NAME.length + 1);
  return token && /^[A-Za-z0-9_-]{32,256}$/.test(token) ? token : null;
};

export const createSessionCookieResolver = ({
  sessions,
  clock = systemClock,
  cacheTtlMs = 60_000
}: SessionCookieResolverDependencies): SessionCookieResolver => {
  const sessionsByTokenHash = new Map<string, Readonly<{ session: ActiveSession; expiresAt: number }>>();
  const tokenHashesBySessionId = new Map<string, Set<string>>();
  const invalidatedSessions = new Map<string, number>();
  const resolve = async (cookieHeader: string | undefined): Promise<ActiveSession | null> => {
    const token = getSessionToken(cookieHeader);
    if (!token) return null;
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const currentTime = new Date(clock.now());
    const cached = sessionsByTokenHash.get(tokenHash);
    if (cached && cached.expiresAt > currentTime.getTime()) return cached.session;
    if (cached) {
      sessionsByTokenHash.delete(tokenHash);
      tokenHashesBySessionId.get(cached.session.sessionId)?.delete(tokenHash);
    }
    const session = await sessions.findAndTouchActiveByTokenHash(tokenHash, currentTime);
    if (!session) return null;
    const invalidatedUntil = invalidatedSessions.get(session.sessionId);
    if (invalidatedUntil && invalidatedUntil > currentTime.getTime()) return null;
    if (sessionsByTokenHash.size >= 100_000) {
      const oldestTokenHash = sessionsByTokenHash.keys().next().value;
      if (oldestTokenHash) {
        const oldest = sessionsByTokenHash.get(oldestTokenHash);
        sessionsByTokenHash.delete(oldestTokenHash);
        if (oldest) tokenHashesBySessionId.get(oldest.session.sessionId)?.delete(oldestTokenHash);
      }
    }
    sessionsByTokenHash.set(tokenHash, { session, expiresAt: currentTime.getTime() + cacheTtlMs });
    const tokenHashes = tokenHashesBySessionId.get(session.sessionId) ?? new Set<string>();
    tokenHashes.add(tokenHash);
    tokenHashesBySessionId.set(session.sessionId, tokenHashes);
    return session;
  };
  return Object.assign(resolve, {
    invalidateSession: (sessionId: string): void => {
      if (invalidatedSessions.size >= 100_000) {
        const oldestSessionId = invalidatedSessions.keys().next().value;
        if (oldestSessionId) invalidatedSessions.delete(oldestSessionId);
      }
      invalidatedSessions.set(sessionId, clock.now() + cacheTtlMs);
      const tokenHashes = tokenHashesBySessionId.get(sessionId);
      if (!tokenHashes) return;
      for (const tokenHash of tokenHashes) sessionsByTokenHash.delete(tokenHash);
      tokenHashesBySessionId.delete(sessionId);
    }
  });
};
