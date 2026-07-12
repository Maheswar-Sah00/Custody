import { redirect } from "next/navigation";

import { getSession } from "@/core/auth/session";
import { loadMaintenanceAssets, loadMaintenanceRequests } from "./_data";
import { MaintenanceClient } from "./_components/maintenance-client";

/**
 * Screen 7 — Maintenance Management (Kanban). Any signed-in user can raise a
 * request; advancing cards across columns is gated to asset managers/admins in
 * the server action. Approving/assigning flips the asset to under_maintenance
 * and resolving returns it to available — both surfaced with a toast.
 */
export const dynamic = "force-dynamic";

export default async function MaintenancePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [requests, assets] = await Promise.all([
    loadMaintenanceRequests(),
    loadMaintenanceAssets(),
  ]);

  return (
    <MaintenanceClient
      requests={requests}
      assets={assets}
      role={session.role}
      currentUserId={session.userId}
    />
  );
}
