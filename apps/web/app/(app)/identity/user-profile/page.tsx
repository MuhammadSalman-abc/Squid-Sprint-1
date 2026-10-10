import { headers } from "next/headers";
import Link from "next/link";
import type { ReactElement } from "react";
import { UserRound } from "lucide-react";
import { z } from "zod";
import { Button, MessageState, PageHeader, PageShell } from "@workspace/ui";
import { createApiConfiguration, readWebEnvironment } from "@/config";
import { UserProfileErrorState } from "@/features/identity/components/user-profile-error-state";
import { UserProfileEditor } from "@/features/identity/components/user-profile-editor";

const UserProfileResponseSchema = z.object({ email: z.string().email(), name: z.string().min(1).max(80), version: z.number().int().nonnegative() });
const ApiErrorResponseSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() })
});

type ProfilePageState =
  | Readonly<{ kind: "ready"; email: string; name: string; version: number }>
  | Readonly<{ kind: "empty"; message: string }>
  | Readonly<{ kind: "error"; message: string; retryable: boolean }>;

const loadUserProfile = async (): Promise<ProfilePageState> => {
  const api = createApiConfiguration(readWebEnvironment());
  const requestHeaders = await headers();
  const cookie = requestHeaders.get("cookie");
  const outgoingHeaders = new Headers();
  if (cookie) outgoingHeaders.set("cookie", cookie);

  try {
    const response = await fetch(`${api.baseUrl.replace(/\/$/, "")}/identity/user-profile`, {
      headers: outgoingHeaders,
      cache: "no-store"
    });

    if (response.status === 404) {
      let error: ReturnType<typeof ApiErrorResponseSchema.safeParse> | undefined;
      try {
        error = ApiErrorResponseSchema.safeParse(await response.json());
      } catch {
        error = undefined;
      }
      if (error?.success && error.data.error.code === "user_profile_not_found") {
        return {
          kind: "error",
          message: "You are signed in, but the profile service could not find your profile in this workspace. Ask your workspace administrator to check your account setup.",
          retryable: false
        };
      }
      return {
        kind: "error",
        message: "The profile endpoint is unavailable. This needs a service configuration fix; retrying will not resolve it.",
        retryable: false
      };
    }
    if (response.status === 401) {
      return { kind: "empty", message: "Sign in with Google or Microsoft to view your profile." };
    }
    if (response.status === 403) {
      return {
        kind: "error",
        message: "Your account has no active workspace. Ask your workspace administrator to finish setting it up before trying again.",
        retryable: false
      };
    }
    if (response.status === 409) {
      return {
        kind: "error",
        message: "A workspace must be selected before this profile can load. Select one, then return to this page.",
        retryable: false
      };
    }
    if (!response.ok) {
      const retryable = response.status >= 500;
      return {
        kind: "error",
        message: retryable
          ? `The profile service returned an error (${response.status}). This may be temporary.`
          : `The profile request was rejected (${response.status}). Check your account access before trying again.`,
        retryable
      };
    }

    const profile = UserProfileResponseSchema.safeParse(await response.json());
    if (!profile.success) {
      return {
        kind: "error",
        message: "The profile service returned data in an unexpected format. A retry is unlikely to help; contact support if this continues.",
        retryable: false
      };
    }

    return { kind: "ready", email: profile.data.email, name: profile.data.name, version: profile.data.version };
  } catch {
    return {
      kind: "error",
      message: "The profile service could not be reached. This may be a temporary connection or service issue; retrying may help.",
      retryable: true
    };
  }
};

const UserProfilePage = async (): Promise<ReactElement> => {
  const state = await loadUserProfile();

  if (state.kind === "empty") {
    return (
      <MessageState
        action={(
          <div className="mt-6">
            <Button asChild>
              <a href="/sign-in">Sign in or create your account</a>
            </Button>
          </div>
        )}
        description={state.message}
        eyebrow="Identity"
        icon={<UserRound aria-hidden="true" className="size-8 text-muted-foreground" />}
        title="Sign in to view your profile"
      />
    );
  }

  if (state.kind === "error") {
    return <UserProfileErrorState message={state.message} retryable={state.retryable} />;
  }

  return (
    <PageShell width="narrow">
      <PageHeader
        description="Your identity information from your sign-in provider."
        eyebrow="Identity"
        icon={<UserRound aria-hidden="true" className="size-5" />}
        title="User profile"
      />
      <UserProfileEditor email={state.email} name={state.name} version={state.version} />
      <div className="mt-4">
        <Button asChild variant="outline"><Link href="/identity/sessions">Manage active sessions</Link></Button>
      </div>
    </PageShell>
  );
};

export default UserProfilePage;
