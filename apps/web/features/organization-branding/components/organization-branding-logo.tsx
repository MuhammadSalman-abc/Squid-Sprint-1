"use client";

import { useState } from "react";
import Image from "next/image";

type OrganizationBrandingLogoProps = Readonly<{
  accentColor: string;
  initials: string;
  logoUrl: string | null;
  organizationName: string;
  size?: "large" | "small";
}>;

export const OrganizationBrandingLogo = ({
  accentColor,
  initials,
  logoUrl,
  organizationName,
  size = "small"
}: OrganizationBrandingLogoProps) => {
  const [failedLogoUrl, setFailedLogoUrl] = useState<string | null>(null);
  const dimensions = size === "large" ? "size-16 rounded-2xl text-xl" : "size-11 rounded-xl text-sm";

  if (logoUrl && failedLogoUrl !== logoUrl) {
    return (
      <div className={`flex shrink-0 items-center justify-center overflow-hidden border border-border ${dimensions}`} style={{ backgroundColor: accentColor }}>
        <Image alt={organizationName} className="size-full bg-white object-contain p-1" height={96} onError={() => setFailedLogoUrl(logoUrl)} src={logoUrl} unoptimized width={96} />
      </div>
    );
  }

  return (
    <div aria-label={organizationName} className={`flex shrink-0 items-center justify-center font-semibold text-white ${dimensions}`} role="img" style={{ backgroundColor: accentColor }}>
      <span aria-hidden="true">{initials}</span>
    </div>
  );
};
