import * as React from "react";
import { cn } from "../utilities/index.js";

type PageShellProps = Readonly<{
  children: React.ReactNode;
  className?: string;
  width?: "standard" | "narrow";
}>;

const widths: Readonly<Record<NonNullable<PageShellProps["width"]>, string>> = {
  standard: "max-w-6xl",
  narrow: "max-w-4xl"
};

export const PageShell = ({ children, className, width = "standard" }: PageShellProps): React.ReactElement => (
  <main className={cn("mx-auto flex w-full flex-col py-3 sm:py-4", widths[width], className)}>
    {children}
  </main>
);
