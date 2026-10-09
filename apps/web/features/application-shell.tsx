"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Route } from "next";
import type { ReactElement, ReactNode } from "react";
import { Activity, ArrowUpRight, Bell, Building2, ChevronDown, CircleUserRound, Fingerprint, Mail, Settings2, ShieldCheck } from "lucide-react";

type Item = Readonly<{ label: string; href: Route; icon: typeof Building2 }>;

const sections: readonly Readonly<{ label: string; items: readonly Item[] }>[] = [
  { label: "WORKSPACE", items: [
    { label: "Organizations", href: "/workspace/organization", icon: Building2 },
    { label: "Branding", href: "/workspace/organization-branding", icon: Activity },
    { label: "Organization settings", href: "/workspace/organization-setting", icon: Settings2 },
    { label: "Invitations", href: "/identity/user-invitation", icon: Mail }
  ] },
  { label: "YOUR ACCOUNT", items: [
    { label: "Profile", href: "/identity/user-profile", icon: CircleUserRound },
    { label: "Sessions & security", href: "/identity/sessions", icon: ShieldCheck }
  ] }
];

const pageNames: readonly Readonly<{ prefix: string; name: string }>[] = [
  { prefix: "/workspace/organization-branding", name: "Organization branding" },
  { prefix: "/workspace/organization-setting", name: "Organization settings" },
  { prefix: "/workspace/organization/new", name: "Create organization" },
  { prefix: "/workspace/organization", name: "Organizations" },
  { prefix: "/workspace/dashboard", name: "Dashboard" },
  { prefix: "/identity/user-invitation", name: "Invitations" },
  { prefix: "/identity/user-profile", name: "Your profile" },
  { prefix: "/identity/sessions", name: "Sessions & security" },
  { prefix: "/organizations", name: "Organization" }
];

export const ApplicationShell = ({ children }: Readonly<{ children: ReactNode }>): ReactElement => {
  const pathname = usePathname() ?? "/";
  const pageName = pageNames.find(({ prefix }) => pathname.startsWith(prefix))?.name ?? "Workspace";

  return (
    <div className="app-frame min-h-screen lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="app-sidebar flex flex-col border-b border-border bg-card lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
        <Link aria-label="Squid home" className="flex h-[76px] items-center gap-3 border-b border-border px-6" href="/">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm"><Activity aria-hidden="true" className="size-[18px]" /></span>
          <span className="text-[17px] font-semibold tracking-[-0.04em]">squid<span className="text-primary">.</span></span>
          <span className="ml-auto rounded-full border border-border bg-background px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">Workspace</span>
        </Link>
        <div className="hidden flex-1 overflow-y-auto px-3 py-6 lg:block">
          <Link className="mb-7 flex items-center gap-3 rounded-xl border border-border bg-background p-3 transition hover:border-primary/25 hover:shadow-sm" href="/workspace/organization">
            <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground"><Building2 aria-hidden="true" className="size-[17px]" /></span>
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">My workspace</span><span className="mt-0.5 block text-xs text-muted-foreground">Organization hub</span></span>
            <ChevronDown aria-hidden="true" className="size-4 text-muted-foreground" />
          </Link>
          {sections.map((section) => <nav aria-label={section.label.toLowerCase()} className="mb-7" key={section.label}>
            <p className="mb-2 px-3 text-[10px] font-semibold tracking-[0.16em] text-muted-foreground/80">{section.label}</p>
            <ul className="grid gap-1">{section.items.map(({ label, href, icon: Icon }) => {
              const active = pathname === href || (href !== "/workspace/organization" && pathname.startsWith(`${href}/`));
              return <li key={href}><Link aria-current={active ? "page" : undefined} className={`group flex items-center gap-3 rounded-lg px-3 py-[10px] text-[13px] font-medium transition-colors ${active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`} href={href}><Icon aria-hidden="true" className={`size-[17px] shrink-0 ${active ? "" : "opacity-75 group-hover:opacity-100"}`} /><span>{label}</span>{active ? <span className="ml-auto size-1.5 rounded-full bg-primary-foreground/80" /> : null}</Link></li>;
            })}</ul>
          </nav>)}
        </div>
        <div className="hidden border-t border-border p-4 lg:block"><Link className="flex items-center gap-3 rounded-xl p-2 transition hover:bg-muted" href="/identity/user-profile"><span className="flex size-9 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground">ME</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">Account</span><span className="block text-xs text-muted-foreground">Profile & preferences</span></span><ArrowUpRight aria-hidden="true" className="size-4 text-muted-foreground" /></Link></div>
      </aside>

      <div className="min-w-0">
        <header className="app-topbar sticky top-0 z-20 flex h-[76px] items-center justify-between border-b border-border/80 bg-background/90 px-5 backdrop-blur-xl sm:px-8 lg:px-10">
          <div className="min-w-0"><p className="text-[11px] font-medium text-muted-foreground">Workspace <span className="px-1.5 text-border">/</span> <span className="text-foreground/80">{pageName}</span></p><h1 className="mt-0.5 truncate text-[15px] font-semibold tracking-[-0.02em]">{pageName}</h1></div>
          <div className="flex items-center gap-2"><span className="hidden items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground sm:inline-flex"><span className="size-1.5 rounded-full bg-emerald-500" />All systems normal</span><button aria-label="Notifications" className="relative flex size-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition hover:bg-muted hover:text-foreground" type="button"><Bell aria-hidden="true" className="size-4" /><span className="absolute right-2 top-2 size-1.5 rounded-full bg-primary" /></button><Link aria-label="Open profile" className="flex size-9 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground ring-4 ring-primary/5" href="/identity/user-profile">ME</Link></div>
        </header>
        <nav aria-label="Workspace navigation" className="flex gap-1 overflow-x-auto border-b border-border bg-card px-4 py-2 lg:hidden">{sections.flatMap((section) => section.items).map(({ label, href, icon: Icon }) => <Link className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${pathname === href ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`} href={href} key={href}><Icon aria-hidden="true" className="size-4" />{label}</Link>)}</nav>
        <div className="app-content min-h-[calc(100vh-76px)] px-4 py-6 sm:px-7 sm:py-9 lg:px-10 lg:py-10">{children}</div>
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 px-5 py-4 text-[11px] text-muted-foreground sm:px-8 lg:px-10"><span>Squid workspace</span><span className="inline-flex items-center gap-1.5"><Fingerprint aria-hidden="true" className="size-3.5" />Secure organization access</span></footer>
      </div>
    </div>
  );
};



