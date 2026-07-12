import { redirect } from "next/navigation";

import { getSession } from "@/core/auth/session";
import { loadAllocationData } from "./_data";
import { AllocationClient } from "./_components/allocation-client";

/**
 * Screen 5 — Asset Allocation & Transfer. Any signed-in user can view and
 * request transfers; allocating, approving, and checking in are gated by role
 * in the server actions (and reflected in the UI affordances here).
 */
export const dynamic = "force-dynamic";

export default async function AllocationPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const data = await loadAllocationData();

  return <AllocationClient data={data} role={session.role} />;
}
