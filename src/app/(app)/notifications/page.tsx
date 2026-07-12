import { redirect } from "next/navigation";

import { getSession } from "@/core/auth/session";
import { hasRole } from "@/core/rbac";

import { NotificationsClient } from "./_components/notifications-client";

/**
 * Screen 10 — Notifications & Activity Log. Both views read live from the API
 * (GET /api/notifications and /api/activity-log) so mark-as-read and filtering
 * stay interactive without a full page reload. The activity-log tab is a
 * compliance view, so it only renders for admins and asset managers — matching
 * the role guard on GET /api/activity-log.
 */
export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <NotificationsClient
      showActivityLog={hasRole(session, ["admin", "asset_manager"])}
    />
  );
}
