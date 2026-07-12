import { NotificationsClient } from "./_components/notifications-client";

/**
 * Screen 10 — Notifications & Activity Log. Both views read live from the API
 * (GET /api/notifications and /api/activity-log) so mark-as-read and filtering
 * stay interactive without a full page reload.
 */
export default function NotificationsPage() {
  return <NotificationsClient />;
}
