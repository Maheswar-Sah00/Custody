import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";

import { PageHeader } from "@/components";
import { getSession } from "@/core/auth/session";
import { hasRole } from "@/core/rbac";

import { loadReports } from "./_data";
import { ReportsClient } from "./_components/reports-client";

/**
 * Screen 9 — Reports & Analytics. Org-wide analytics are for admins, asset
 * managers, and department heads; employees who navigate here directly see a
 * "managers only" panel instead of any data. Server component: it computes the
 * full analytics bundle once and hands it to the client, which renders the
 * Recharts charts, lists, heatmap, and CSV export.
 */
export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  if (!hasRole(session, ["admin", "asset_manager", "dept_head"])) {
    return (
      <>
        <PageHeader
          title="Reports & Analytics"
          description="Utilization, maintenance, and booking analytics."
        />
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card/40 text-center">
          <ShieldAlert className="size-8 text-muted-foreground" />
          <div>
            <p className="text-lg font-medium text-foreground">Managers only</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Org-wide reports are available to admins, asset managers, and
              department heads.
            </p>
          </div>
        </div>
      </>
    );
  }

  const data = await loadReports();

  return <ReportsClient data={data} />;
}
