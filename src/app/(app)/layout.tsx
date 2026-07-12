import { redirect } from "next/navigation"

import { eq } from "drizzle-orm";

import { getSession } from "@/core/auth/session";
import { db } from "@/core/db";
import { auditCycleAuditors } from "@/core/db/schema";
import { ToastProvider } from "@/components";
import { Sidebar } from "./_components/sidebar";
import { CommandPalette } from "./_components/command-palette";

/**
 * Shell for every authenticated screen: fixed left sidebar + scrollable main.
 * Reads the session server-side and bounces unauthenticated visitors to login.
 * The sidebar is role-aware (see NAV_ITEMS in _components/sidebar.tsx).
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  // Admins and asset managers always see Audit; for everyone else the item
  // only appears when they are assigned as an auditor on a cycle.
  const seesAuditAnyway =
    session.role === "admin" || session.role === "asset_manager";
  const isAuditor = seesAuditAnyway
    ? false
    : (
        await db
          .select({ cycleId: auditCycleAuditors.cycleId })
          .from(auditCycleAuditors)
          .where(eq(auditCycleAuditors.userId, session.userId))
          .limit(1)
      ).length > 0;

  return (
    <ToastProvider>
      <div className="min-h-screen bg-background">
        <Sidebar
          user={{ name: session.name, role: session.role }}
          isAuditor={isAuditor}
        />
        <CommandPalette role={session.role} />
        <div className="pl-60">
          <main className="mx-auto min-h-screen w-full max-w-7xl px-8 py-8">
            {children}
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
