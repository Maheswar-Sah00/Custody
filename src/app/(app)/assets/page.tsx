import { getSession } from "@/core/auth/session";
import { hasRole } from "@/core/rbac";
import { loadAssetsDirectory } from "./_data";
import { AssetsClient } from "./_components/assets-client";

/**
 * Screen 4 — Asset Registration & Directory. Any signed-in user can browse the
 * directory; registration and CSV import are gated to admins/asset managers
 * (the server actions enforce the same, so this only controls affordances).
 */
export const dynamic = "force-dynamic";

export default async function AssetsPage() {
  const session = await getSession();
  const assets = await loadAssetsDirectory();
  const canRegister = hasRole(session, ["admin", "asset_manager"]);

  return <AssetsClient assets={assets} canRegister={canRegister} />;
}
