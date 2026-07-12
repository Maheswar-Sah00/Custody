import { redirect } from "next/navigation";

import { getSession } from "@/core/auth/session";
import { hasRole } from "@/core/rbac";
import { APPROVAL_ROLES, loadApprovalInbox } from "./_data";
import { ApprovalsClient } from "./_components/approvals-client";

/**
 * Approval Inbox — one unified queue of everything awaiting the current
 * manager's action (pending transfers + pending maintenance). This screen only
 * READS existing data; every Approve/Reject reuses the existing Allocation and
 * Maintenance server actions. Visible to admin, asset_manager, and dept_head;
 * employees are bounced (the route and actions reject them server-side too).
 */
export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!hasRole(session, APPROVAL_ROLES)) redirect("/dashboard");

  const inbox = await loadApprovalInbox(session);

  return <ApprovalsClient inbox={inbox} role={session.role} />;
}
