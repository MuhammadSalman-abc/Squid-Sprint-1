import type { ReactElement } from "react";
import { ArrowUpRight, Building2, ShieldCheck } from "lucide-react";
import { Button } from "@workspace/ui";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/primitives";
import { signInToTemporaryBrandingDemo } from "./actions";

type LoginPageProps = Readonly<{ searchParams: Promise<Readonly<{ error?: string }>> }>;

const OrganizationBrandingLoginPage = async ({ searchParams }: LoginPageProps): Promise<ReactElement> => {
  const { error } = await searchParams;
  const demoEnabled = process.env.TEMP_ORG_BRANDING_DEMO_ENABLED === "true";
  return (
    <main className="min-h-screen bg-background lg:grid lg:grid-cols-[1.02fr_0.98fr]">
      <section aria-label="Squid organization tools" className="relative hidden min-h-screen flex-col justify-between overflow-hidden bg-primary p-12 text-primary-foreground lg:flex xl:p-16">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-[0.08]" style={{ backgroundImage: "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)", backgroundSize: "48px 48px", maskImage: "linear-gradient(to bottom right, black, transparent 78%)" }} />
        <div className="relative flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-xl border border-primary-foreground/20 bg-primary-foreground/10"><Building2 aria-hidden="true" className="size-5" /></span><span className="text-lg font-semibold tracking-tight">squid</span><span className="ml-1 border-l border-primary-foreground/25 pl-3 text-xs font-medium uppercase tracking-[0.16em] text-primary-foreground/65">Branding preview</span></div>
        <div className="relative max-w-xl py-16"><p className="mb-5 text-xs font-semibold uppercase tracking-[0.18em] text-primary-foreground/65">A familiar workspace</p><h1 className="max-w-lg text-4xl font-semibold leading-[1.12] tracking-tight xl:text-5xl">Your organization, at a glance.</h1><p className="mt-6 max-w-md text-base leading-7 text-primary-foreground/75">Preview organization identity and branding in a calm, secure workspace.</p><div className="mt-10 flex items-center gap-3 text-sm text-primary-foreground/70"><ShieldCheck aria-hidden="true" className="size-4" /><span>Temporary local demo access</span></div></div>
        <div className="relative border-t border-primary-foreground/15 pt-5 text-xs text-primary-foreground/55">Organization branding · Local preview</div>
      </section>
      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8"><div className="w-full max-w-md">
        <div className="mb-8 flex items-center gap-2 text-sm font-semibold text-foreground lg:hidden"><Building2 aria-hidden="true" className="size-5 text-primary" />Squid branding preview</div>
        <Card className="rounded-2xl border-border/80 bg-card shadow-xl shadow-foreground/[0.035] sm:p-2"><CardHeader className="px-6 pt-7 sm:px-8 sm:pt-8"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">Workspace access</p><CardTitle className="mt-2 text-2xl tracking-tight">Organization branding demo</CardTitle><CardDescription className="text-sm leading-6">Sign in with the temporary local demo credentials configured for this workspace.</CardDescription></CardHeader>
          <CardContent className="px-6 pb-7 sm:px-8 sm:pb-8">
            {!demoEnabled ? <div className="rounded-xl border border-border bg-muted/60 p-4 text-sm leading-6 text-muted-foreground">Temporary demo login is disabled. Enable it in the local web environment and configure the matching API settings.</div> : <>
              {error === "credentials" ? <p className="mb-4 rounded-lg border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive" role="alert">Enter your demo email and password.</p> : null}
              {error === "unavailable" ? <p className="mb-4 rounded-lg border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive" role="alert">Demo sign-in failed. Check that the local API is running and the demo credentials match.</p> : null}
              <form action={signInToTemporaryBrandingDemo} className="grid gap-4">
                <label className="grid gap-2 text-sm font-medium" htmlFor="email">Email address<input autoComplete="username" className="h-11 rounded-lg border border-input bg-background px-3 font-normal outline-none transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" id="email" name="email" placeholder="you@company.com" required type="email" /></label>
                <label className="grid gap-2 text-sm font-medium" htmlFor="password">Password<input autoComplete="current-password" className="h-11 rounded-lg border border-input bg-background px-3 font-normal outline-none transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" id="password" name="password" placeholder="Enter your password" required type="password" /></label>
                <Button className="mt-1 h-11 w-full justify-between px-4" size="lg" type="submit"><span>Sign in</span><ArrowUpRight aria-hidden="true" className="size-4" /></Button>
              </form>
            </>}
          </CardContent>
        </Card>
        <p className="mt-5 px-2 text-center text-xs leading-5 text-muted-foreground">Demo access is local to this workspace and does not create a production session.</p>
      </div></section>
    </main>
  );
};

export default OrganizationBrandingLoginPage;

