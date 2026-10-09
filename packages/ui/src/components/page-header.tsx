import * as React from "react";

type PageHeaderProps = Readonly<{
  description: string;
  eyebrow: string;
  icon: React.ReactNode;
  title: string;
}>;

export const PageHeader = ({ description, eyebrow, icon, title }: PageHeaderProps): React.ReactElement => (
  <header className="mb-8 border-b border-border pb-7 sm:mb-9 sm:pb-8">
    <div className="mb-5 flex size-12 items-center justify-center rounded-2xl border border-primary/10 bg-accent text-accent-foreground shadow-sm shadow-primary/5">
      {icon}
    </div>
    <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">{eyebrow}</p>
    <h1 className="max-w-3xl text-3xl font-semibold leading-tight tracking-[-0.04em] text-foreground sm:text-[2.5rem]">{title}</h1>
    <p className="mt-3 max-w-2xl text-[15px] leading-7 text-muted-foreground">{description}</p>
  </header>
);
