import type { ReactElement } from "react";
import { ArrowUpRight, Building2, KeyRound } from "lucide-react";
import { Button } from "@workspace/ui";
import { createApiConfiguration, readWebEnvironment } from "@/config";
import { signIn } from "@/features/auth/auth.actions";

type SignInPageProps = Readonly<{
  searchParams: Promise<Readonly<{ error?: string | readonly string[]; returnTo?: string }>>;
}>;

type SignInError = Readonly<{ title: string; description: string }>;

const signInErrors: Readonly<Record<string, SignInError>> = Object.freeze({
  credentials: { title: "Email or password is incorrect", description: "Check your credentials and try again." },
  "provider-unavailable": { title: "Sign-in provider unavailable", description: "Google or Microsoft could not complete sign-in. Try again in a moment." },
  "invalid-sign-in": { title: "Sign-in could not be verified", description: "No account or session was created. Choose a provider to try again." },
  "account-closed": { title: "This account is closed", description: "Contact your organization administrator for help." }
});

const SignInPage = async ({ searchParams }: SignInPageProps): Promise<ReactElement> => {
  const parameters = await searchParams;
  const errorCode = typeof parameters.error === "string" ? parameters.error : undefined;
  const error = errorCode ? signInErrors[errorCode] : undefined;
  const apiBaseUrl = createApiConfiguration(readWebEnvironment()).baseUrl.replace(/\/$/, "");

  return (
    <main className="min-h-screen bg-muted/30 lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(28rem,0.95fr)]">
      <section aria-label="Squid workspace" className="relative hidden min-h-screen flex-col justify-between overflow-hidden bg-primary p-10 text-primary-foreground lg:flex xl:p-14">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-[0.08]" style={{ backgroundImage: "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)", backgroundSize: "48px 48px", maskImage: "linear-gradient(to bottom right, black, transparent 78%)" }} />
        <div className="relative flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl border border-primary-foreground/20 bg-primary-foreground/10"><Building2 aria-hidden="true" className="size-5" /></span>
          <span className="text-lg font-semibold tracking-tight">squid</span>
          <span className="ml-1 border-l border-primary-foreground/25 pl-3 text-xs font-medium uppercase tracking-[0.16em] text-primary-foreground/65">Workspace</span>
        </div>
        <div className="relative max-w-xl py-16">
          <p className="mb-5 text-xs font-semibold uppercase tracking-[0.18em] text-primary-foreground/65">One place for your teams</p>
          <h1 className="max-w-lg text-4xl font-semibold leading-[1.12] tracking-tight xl:text-5xl">Your work, in its right place.</h1>
          <p className="mt-6 max-w-md text-base leading-7 text-primary-foreground/75">Sign in to reach the organizations and workspaces connected to your account.</p>
          <div className="mt-10 flex items-center gap-3 text-sm text-primary-foreground/70"><KeyRound aria-hidden="true" className="size-4" /><span>Secure access through your identity provider</span></div>
        </div>
        <div className="relative flex items-center justify-between border-t border-primary-foreground/15 pt-5 text-xs text-primary-foreground/55">
          <span>Squid workspace</span><span>Identity · Organizations · Teams</span>
        </div>
      </section>

      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-2 text-sm font-semibold text-foreground lg:hidden"><Building2 aria-hidden="true" className="size-5 text-primary" />Squid workspace</div>
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-9">
            <div className="mb-7">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Workspace access</p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">Sign in</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">Choose how you want to continue to your workspace.</p>
            </div>

            {error ? <section aria-live="polite" className="mb-6 rounded-xl border border-destructive/40 bg-destructive/5 p-4" role="alert"><h3 className="text-sm font-semibold text-foreground">{error.title}</h3><p className="mt-1 text-sm leading-5 text-muted-foreground">{error.description}</p></section> : null}

            <div aria-label="Sign-in providers" className="grid gap-3">
              <Button asChild className="h-11 justify-between px-4" size="lg" variant="outline"><a href={`${apiBaseUrl}/identity/sign-in/google`}><span>Continue with Google</span><ArrowUpRight aria-hidden="true" className="size-4 text-muted-foreground" /></a></Button>
              <Button asChild className="h-11 justify-between px-4" size="lg" variant="outline"><a href={`${apiBaseUrl}/identity/sign-in/microsoft`}><span>Continue with Microsoft</span><ArrowUpRight aria-hidden="true" className="size-4 text-muted-foreground" /></a></Button>
            </div>

            <div className="my-6 flex items-center gap-4" role="separator" aria-label="Or use email and password"><span className="h-px flex-1 bg-border" /><span className="text-xs font-medium text-muted-foreground">OR CONTINUE WITH EMAIL</span><span className="h-px flex-1 bg-border" /></div>

            <form action={signIn} className="grid gap-4">
              {typeof parameters.returnTo === "string" && parameters.returnTo.startsWith("/workspace/invitations/accept?token=") ? <input name="returnTo" type="hidden" value={parameters.returnTo} /> : null}
              <label className="grid gap-2 text-sm font-medium text-foreground" htmlFor="email">Email address<input autoComplete="email" className="h-11 rounded-lg border border-input bg-background px-3 font-normal outline-none transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" id="email" name="email" placeholder="you@company.com" required type="email" /></label>
              <label className="grid gap-2 text-sm font-medium text-foreground" htmlFor="password">Password<input autoComplete="current-password" className="h-11 rounded-lg border border-input bg-background px-3 font-normal outline-none transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" id="password" name="password" placeholder="Enter your password" required type="password" /></label>
              <Button className="mt-1 h-11 w-full" size="lg" type="submit">Sign in with email</Button>
            </form>
          </div>
          <p className="mt-5 px-2 text-center text-xs leading-5 text-muted-foreground">Need access? Ask your organization administrator for an invitation.</p>
        </div>
      </section>
    </main>
  );
};

export default SignInPage;