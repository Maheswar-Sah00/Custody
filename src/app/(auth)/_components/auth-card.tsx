import * as React from "react";

import { Card } from "@/components";

/** Shared auth card: AF logo circle, title, optional subtitle, then content. */
export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-8">
      <div className="mb-6 flex flex-col items-center text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground">
          AF
        </span>
        <h1 className="mt-4 text-xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      {children}
    </Card>
  );
}
