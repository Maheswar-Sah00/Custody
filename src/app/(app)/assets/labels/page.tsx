import { getSession } from "@/core/auth/session";
import { qrDataUrl } from "@/lib/qr";
import { loadAssetsDirectory } from "../_data";
import { LabelsClient, type LabelAsset } from "./_components/labels-client";

/**
 * QR Label Sheet — a print-optimized page for producing physical QR stickers.
 *
 * Read-only and self-contained: it reuses the Assets directory query, renders
 * every asset's stored QR payload to a self-contained PNG data URL server-side
 * (the `qrcode` package runs on the server only — never the client, never an
 * external API), and hands the pre-rendered images to a client picker. Print
 * CSS lives inside {@link LabelsClient} so it only applies while this page is
 * mounted and never touches the rest of the app.
 */
export const dynamic = "force-dynamic";

export default async function LabelsPage() {
  await getSession(); // layout already gates auth; this keeps parity with siblings.

  const rows = await loadAssetsDirectory();

  // Render each asset's QR to a PNG data URL up front. Done server-side and in
  // parallel so the client component receives ready-to-print images.
  const assets: LabelAsset[] = await Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      tag: r.tag,
      name: r.name,
      categoryId: r.categoryId,
      categoryName: r.categoryName,
      location: r.location,
      qrData: r.qrData,
      qrImage: await qrDataUrl(r.qrData),
    })),
  );

  return <LabelsClient assets={assets} />;
}
