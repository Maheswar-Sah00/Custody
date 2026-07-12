import { redirect } from "next/navigation";

import { getSession } from "@/core/auth/session";

import {
  loadAuditCycles,
  loadCreateAuditOptions,
  loadCycleDetail,
  pickDefaultCycleId,
} from "./_data";
import { AuditClient } from "./_components/audit-client";

/**
 * Screen 8 — Asset Audit. Lists every audit cycle, opens on the active one (or
 * the most recent), and shows its checklist. The selected cycle is driven by the
 * `?cycle=<id>` query param so history and deep-links work. All mutations live
 * in actions.ts; the client keeps the checklist + discrepancy banner live.
 */
export const dynamic = "force-dynamic";

export default async function AuditPage({
  searchParams,
}: {
  searchParams: { cycle?: string };
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const [cycles, options] = await Promise.all([
    loadAuditCycles(),
    loadCreateAuditOptions(),
  ]);

  const requested = Number(searchParams.cycle);
  const selectedId =
    Number.isInteger(requested) && cycles.some((c) => c.id === requested)
      ? requested
      : pickDefaultCycleId(cycles);

  const detail = selectedId != null ? await loadCycleDetail(selectedId) : null;

  return (
    <AuditClient
      cycles={cycles}
      detail={detail}
      options={options}
      currentUser={{
        id: session.userId,
        name: session.name,
        role: session.role,
      }}
    />
  );
}
