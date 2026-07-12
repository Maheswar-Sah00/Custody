import { redirect } from "next/navigation";

import { getSession } from "@/core/auth/session";

import { loadReports } from "./_data";
import { ReportsClient } from "./_components/reports-client";

/**
 * Screen 9 — Reports & Analytics. Server component: it computes the full
 * analytics bundle once (the same loader backs GET /api/reports) and hands it to
 * the client, which renders the Recharts charts, lists, heatmap, and CSV export.
 */
export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const data = await loadReports();

  return <ReportsClient data={data} />;
}
