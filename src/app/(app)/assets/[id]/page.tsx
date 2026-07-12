import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { loadAssetDetail } from "../_data";
import { qrDataUrl } from "@/lib/qr";
import { AssetDetailView } from "./_components/asset-detail";

/**
 * Screen 4 — Asset Detail. Shows every field, a printable QR code (rendered to a
 * self-contained PNG on the server from the stored qr_data — no external API),
 * and Allocation / Maintenance history tabs for this asset.
 */
export const dynamic = "force-dynamic";

export default async function AssetDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const detail = await loadAssetDetail(id);
  if (!detail) notFound();

  const qrImage = await qrDataUrl(detail.qrData);

  return (
    <>
      <Link
        href="/assets"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground [&_svg]:size-4"
      >
        <ArrowLeft />
        Back to assets
      </Link>
      <AssetDetailView detail={detail} qrImage={qrImage} />
    </>
  );
}
