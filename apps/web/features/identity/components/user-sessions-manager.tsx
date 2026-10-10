"use client";

import { useState, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@workspace/ui";

export type UserSessionItem = Readonly<{
  sessionId: string;
  device: string;
  lastUsedAt: string;
  isCurrent: boolean;
}>;

type UserSessionsManagerProps = Readonly<{ initialSessions: readonly UserSessionItem[] }>;

const sessionTimestampFormatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "short",
  timeStyle: "medium",
  timeZone: "UTC",
  hourCycle: "h23"
});

export const UserSessionsManager = ({ initialSessions }: UserSessionsManagerProps): ReactElement => {
  const [sessions, setSessions] = useState(initialSessions);
  const [message, setMessage] = useState("");
  const [revoking, setRevoking] = useState<string | null>(null);
  const router = useRouter();

  const revoke = async (session: UserSessionItem): Promise<void> => {
    setRevoking(session.sessionId);
    setMessage("");
    try {
      const response = await fetch(`/api/identity/sessions/${encodeURIComponent(session.sessionId)}`, { method: "DELETE" });
      if (response.status === 404) {
        setMessage("That session is no longer active. Refresh the page to update the list.");
        setSessions((current) => current.filter((item) => item.sessionId !== session.sessionId));
        return;
      }
      if (!response.ok) {
        setMessage("Could not end that session. Please try again.");
        return;
      }
      setSessions((current) => current.filter((item) => item.sessionId !== session.sessionId));
      if (session.isCurrent) {
        await fetch("/api/identity/session", { method: "DELETE" });
        router.push("/sign-in");
      }
      else setMessage(`${session.device} was signed out.`);
    } catch {
      setMessage("Could not reach the session service. Please try again.");
    } finally {
      setRevoking(null);
    }
  };

  return (
    <div className="mt-8 grid gap-4">
      {sessions.length === 0 ? <p className="text-sm text-muted-foreground">No active sessions were found.</p> : (
        <ul className="grid gap-3">
          {sessions.map((session) => (
            <li className="flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4" key={session.sessionId}>
              <div className="grid gap-1">
                <p className="font-medium">{session.device}{session.isCurrent ? <span className="ml-2 text-sm text-muted-foreground">This device</span> : null}</p>
                <p className="text-sm text-muted-foreground">Last active {sessionTimestampFormatter.format(new Date(session.lastUsedAt))} UTC</p>
              </div>
              <Button disabled={revoking !== null} onClick={() => void revoke(session)} type="button" variant="outline">
                {revoking === session.sessionId ? "Signing out…" : "Sign out"}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <p aria-live="polite" className="min-h-5 text-sm text-muted-foreground">{message}</p>
    </div>
  );
};
