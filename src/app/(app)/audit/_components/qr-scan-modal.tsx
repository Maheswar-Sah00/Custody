"use client";

import * as React from "react";
import jsQR from "jsqr";
import {
  CameraOff,
  CheckCircle2,
  Loader2,
  ScanLine,
  TriangleAlert,
} from "lucide-react";

import { Button, Modal, StatusPill } from "@/components";
import { cn } from "@/lib/utils";
import type { AuditItemRow } from "../_data";
import type { VerificationChoice } from "./verification-toggle";

/**
 * QR scan-to-audit. Reads an asset's QR code straight from the device camera
 * with jsQR (no external service), matches it to a checklist row, and lets the
 * auditor mark Verified / Missing / Damaged on the spot. Marking flows through
 * the same server action as the table, so the discrepancy banner behind the
 * modal updates live. Point → mark → point at the next one.
 */

type ScanStatus = "idle" | "starting" | "scanning" | "error";

interface Scanned {
  tag: string;
  item: AuditItemRow | null;
}

/** Pull an asset tag out of a scanned payload ("assetflow:asset:AF-0114"). */
function parseTag(raw: string): string | null {
  const text = raw.trim();
  const m = text.match(/asset:([A-Za-z0-9-]+)$/i);
  if (m) return m[1].toUpperCase();
  if (/^AF-\d+$/i.test(text)) return text.toUpperCase();
  return null;
}

export function QrScanModal({
  open,
  onOpenChange,
  items,
  canMark,
  onMark,
  onScanMatch,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: AuditItemRow[];
  canMark: boolean;
  onMark: (item: AuditItemRow, verification: VerificationChoice) => Promise<boolean>;
  /** Fired when a scanned code matches a checklist row (parent highlights it). */
  onScanMatch?: (item: AuditItemRow) => void;
}) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const rafRef = React.useRef<number | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const lastTagRef = React.useRef<string | null>(null);

  // Latest items, read inside the RAF loop without re-subscribing it.
  const itemsRef = React.useRef(items);
  React.useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Latest onScanMatch, read from the stable decode callback below.
  const onScanMatchRef = React.useRef(onScanMatch);
  React.useEffect(() => {
    onScanMatchRef.current = onScanMatch;
  }, [onScanMatch]);

  const [status, setStatus] = React.useState<ScanStatus>("idle");
  const [errorMsg, setErrorMsg] = React.useState<string>("");
  const [scanned, setScanned] = React.useState<Scanned | null>(null);
  const [busy, setBusy] = React.useState(false);

  const handleDecode = React.useCallback((raw: string) => {
    const tag = parseTag(raw);
    if (!tag) return;
    if (lastTagRef.current === tag) return; // already showing this one
    lastTagRef.current = tag;
    const item =
      itemsRef.current.find((i) => i.tag.toUpperCase() === tag) ?? null;
    setScanned({ tag, item });
    if (item) onScanMatchRef.current?.(item);
  }, []);

  React.useEffect(() => {
    if (!open) return;

    let cancelled = false;

    const tick = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (w && h) {
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (ctx) {
            ctx.drawImage(video, 0, 0, w, h);
            const image = ctx.getImageData(0, 0, w, h);
            const code = jsQR(image.data, w, h, {
              inversionAttempts: "dontInvert",
            });
            if (code?.data) handleDecode(code.data);
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    const start = async () => {
      setStatus("starting");
      setErrorMsg("");
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("error");
        setErrorMsg("This device or browser can't access a camera.");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        video.setAttribute("playsinline", "true");
        await video.play();
        setStatus("scanning");
        rafRef.current = requestAnimationFrame(tick);
      } catch (err) {
        setStatus("error");
        setErrorMsg(
          err instanceof DOMException && err.name === "NotAllowedError"
            ? "Camera permission was denied. Allow it in your browser to scan."
            : "Couldn't start the camera. Check it isn't in use by another app.",
        );
      }
    };

    start();

    const videoEl = videoRef.current;
    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (videoEl) videoEl.srcObject = null;
      lastTagRef.current = null;
      setScanned(null);
      setStatus("idle");
    };
  }, [open, handleDecode]);

  async function mark(verification: VerificationChoice) {
    if (!scanned?.item) return;
    setBusy(true);
    const ok = await onMark(scanned.item, verification);
    setBusy(false);
    if (ok) {
      setScanned((s) =>
        s?.item ? { ...s, item: { ...s.item, verification } } : s,
      );
      // Let the same code be re-scanned (e.g. to correct a mistake).
      lastTagRef.current = null;
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Scan to audit"
      description="Point the camera at an asset's QR code, then mark it right here."
      className="max-w-md"
      footer={
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Done
        </Button>
      }
    >
      <div className="space-y-4">
        {/* Camera viewport */}
        <div className="relative aspect-square overflow-hidden rounded-lg border border-border bg-black">
          <video
            ref={videoRef}
            className="size-full object-cover"
            muted
            playsInline
          />
          <canvas ref={canvasRef} className="hidden" />

          {/* Scan reticle */}
          {status === "scanning" ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="size-2/3 rounded-lg border-2 border-primary/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
              <ScanLine className="absolute size-8 animate-pulse text-primary/80" />
            </div>
          ) : null}

          {status === "starting" ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-zinc-300">
              <Loader2 className="size-6 animate-spin" />
              Starting camera…
            </div>
          ) : null}

          {status === "error" ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center text-sm text-zinc-300">
              <CameraOff className="size-6 text-red-400" />
              {errorMsg}
            </div>
          ) : null}
        </div>

        {/* Matched-asset panel */}
        {scanned ? (
          <ScannedPanel
            scanned={scanned}
            canMark={canMark}
            busy={busy}
            onMark={mark}
          />
        ) : (
          <p className="text-center text-xs text-muted-foreground">
            Waiting for a QR code…
          </p>
        )}
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/*  Matched asset + mark buttons                                              */
/* -------------------------------------------------------------------------- */

const CHOICES: { value: VerificationChoice; label: string; className: string }[] =
  [
    {
      value: "verified",
      label: "Verified",
      className:
        "border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/15",
    },
    {
      value: "missing",
      label: "Missing",
      className: "border-red-500/40 text-red-300 hover:bg-red-500/15",
    },
    {
      value: "damaged",
      label: "Damaged",
      className: "border-amber-500/40 text-amber-300 hover:bg-amber-500/15",
    },
  ];

function ScannedPanel({
  scanned,
  canMark,
  busy,
  onMark,
}: {
  scanned: Scanned;
  canMark: boolean;
  busy: boolean;
  onMark: (v: VerificationChoice) => void;
}) {
  if (!scanned.item) {
    return (
      <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-400" />
        <span>
          <span className="font-mono font-medium">{scanned.tag}</span> isn&apos;t
          in this cycle&apos;s checklist.
        </span>
      </div>
    );
  }

  const item = scanned.item;
  return (
    <div className="space-y-3 rounded-lg border border-border bg-secondary/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-sm font-medium text-foreground">
            {item.tag}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {item.assetName}
          </p>
        </div>
        <StatusPill status={item.verification} />
      </div>
      {item.expectedLocation ? (
        <p className="text-xs text-muted-foreground">
          Expected at{" "}
          <span className="text-foreground">{item.expectedLocation}</span>
        </p>
      ) : null}

      {canMark ? (
        <div className="grid grid-cols-3 gap-2">
          {CHOICES.map((choice) => {
            const active = item.verification === choice.value;
            return (
              <button
                key={choice.value}
                type="button"
                disabled={busy}
                onClick={() => onMark(choice.value)}
                className={cn(
                  "inline-flex items-center justify-center gap-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors disabled:opacity-50",
                  choice.className,
                  active && "bg-current/10 ring-1 ring-current",
                )}
              >
                {busy ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : active ? (
                  <CheckCircle2 className="size-3.5" />
                ) : null}
                {choice.label}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          This cycle is closed — verification is locked.
        </p>
      )}
    </div>
  );
}
