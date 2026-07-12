/**
 * QR code helpers for assets.
 *
 * The QR *payload* is a stable, offline-decodable string (no external service);
 * the seed uses the same `assetflow:asset:<tag>` shape. {@link qrDataUrl} turns a
 * payload into a self-contained PNG data URL via the local `qrcode` package, so
 * the code can be shown and printed without ever hitting the network.
 */
import QRCode from "qrcode";

/** Canonical QR payload for an asset tag, e.g. "assetflow:asset:AF-0114". */
export function qrPayload(tag: string): string {
  return `assetflow:asset:${tag}`;
}

/**
 * Render a QR payload to a PNG data URL. Uses AssetFlow's dark palette so the
 * code reads well on the app's zinc surfaces while staying scanner-friendly.
 */
export async function qrDataUrl(payload: string): Promise<string> {
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 256,
    color: { dark: "#0a0a0aff", light: "#ffffffff" },
  });
}
