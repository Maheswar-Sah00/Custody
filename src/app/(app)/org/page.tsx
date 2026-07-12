import { ShieldAlert } from "lucide-react";

import { PageHeader } from "@/components";
import { getSession } from "@/core/auth/session";
import { loadOrgData } from "./_data";
import { OrgClient } from "./_components/org-client";

/**
 * Screen 3 — Organization Setup. ADMIN ONLY. The app layout already bounces
 * unauthenticated visitors; here we additionally hard-gate on the admin role so
 * a non-admin who navigates straight to /org sees an "Admins only" panel rather
 * than any org data. The picklist APIs and server actions enforce the same
 * server-side, so this is defense-in-depth, not the only check.
 */
export const dynamic = "force-dynamic";

export default async function OrganizationSetupPage() {
  const session = await getSession();

  if (!session || session.role !== "admin") {
    return (
      <>
        <PageHeader
          title="Organization setup"
          description="Departments, asset categories, and people."
        />
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card/40 text-center">
          <ShieldAlert className="size-8 text-muted-foreground" />
          <div>
            <p className="text-lg font-medium text-foreground">Admins only</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              You need the administrator role to manage the organization.
            </p>
          </div>
        </div>
      </>
    );
  }

  const data = await loadOrgData();

  return <OrgClient data={data} />;
}
