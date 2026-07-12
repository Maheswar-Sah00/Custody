import { redirect } from "next/navigation"

import { getSession } from "@/core/auth/session";
import { ToastProvider } from "@/components";
import { Sidebar } from "./_components/sidebar";

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

  return (
    <ToastProvider>
      <div className="min-h-screen bg-background">
        <Sidebar user={{ name: session.name, role: session.role }} />
        <div className="pl-60">
          <main className="mx-auto min-h-screen w-full max-w-7xl px-8 py-8">
            {children}
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
