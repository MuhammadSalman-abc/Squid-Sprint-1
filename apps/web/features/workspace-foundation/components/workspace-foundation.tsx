import type { ReactElement } from "react";
import { Activity } from "lucide-react";
import { Button, PageHeader, PageShell } from "@workspace/ui";
import { ApiBoundary } from "./api-boundary";
import { RuntimeFoundation } from "./runtime-foundation";

type WorkspaceFoundationProps = Readonly<{ apiBaseUrl: string }>;

export const WorkspaceFoundation = ({ apiBaseUrl }: WorkspaceFoundationProps): ReactElement => (
  <div className="relative isolate min-h-screen overflow-hidden bg-background">
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[34rem] bg-[radial-gradient(ellipse_at_top_right,rgba(18,107,98,0.13),transparent_55%),linear-gradient(180deg,rgba(255,255,255,0.8),transparent)]" />
    <PageShell className="min-h-screen px-5 py-9 sm:px-9 sm:py-14 lg:py-16">
      <div className="mb-14 flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm"><Activity aria-hidden="true" className="size-5" /></span><span className="text-lg font-semibold tracking-tight">squid<span className="text-primary">.</span></span><span className="ml-1 rounded-full border border-border bg-card px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Workspace platform</span></div>
      <div className="max-w-4xl rounded-3xl border border-border/80 bg-card/80 p-6 shadow-xl shadow-foreground/[0.035] backdrop-blur sm:p-10 lg:p-12">
        <PageHeader description="Your team workspace is ready. Sign in to manage organizations, invitations and account security from one place." eyebrow="A clearer place to work together" icon={<Activity aria-hidden="true" className="size-5" />} title="Bring your team’s work into focus." />
        <div className="mt-7 flex flex-wrap gap-3"><Button asChild className="h-11 px-5" size="lg"><a href="/sign-in">Sign in to Squid</a></Button><a className="inline-flex h-11 items-center rounded-lg border border-border bg-background px-5 text-sm font-medium transition hover:bg-muted" href="/workspace/organization">Explore workspace</a></div>
        <RuntimeFoundation />
        <ApiBoundary baseUrl={apiBaseUrl} />
      </div>
    </PageShell>
  </div>
);
