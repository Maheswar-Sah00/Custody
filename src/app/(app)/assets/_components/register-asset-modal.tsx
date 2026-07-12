"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload } from "lucide-react";

import {
  Button,
  DatePickerField,
  InputField,
  Modal,
  SelectField,
  useToast,
} from "@/components";
import { createAsset } from "../actions";
import type { CategoryOption } from "./assets-client";

interface RegisterAssetModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Live categories (with custom-field defs) from /api/org/categories. */
  categories: CategoryOption[];
}

const EMPTY_FORM = {
  name: "",
  categoryId: "",
  serialNumber: "",
  acquisitionDate: "",
  acquisitionCost: "",
  condition: "",
  location: "",
  isBookable: false,
};

/**
 * Register Asset modal. Renders the base fields plus any custom fields defined
 * on the selected category (e.g. Electronics → warranty_months). Photos are
 * uploaded to local disk via /api/uploads first; the returned path is saved with
 * the asset. The tag + QR are generated server-side.
 */
export function RegisterAssetModal({
  open,
  onOpenChange,
  categories,
}: RegisterAssetModalProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [form, setForm] = React.useState(EMPTY_FORM);
  const [customValues, setCustomValues] = React.useState<Record<string, string>>(
    {},
  );
  const [photo, setPhoto] = React.useState<File | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [submitting, setSubmitting] = React.useState(false);

  // Reset everything whenever the modal is (re)opened.
  React.useEffect(() => {
    if (open) {
      setForm(EMPTY_FORM);
      setCustomValues({});
      setPhoto(null);
      setErrors({});
    }
  }, [open]);

  const selectedCategory = categories.find(
    (c) => String(c.id) === form.categoryId,
  );
  const customFieldDefs = selectedCategory?.customFields ?? {};

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = "Asset name is required.";
    if (!form.categoryId) next.categoryId = "Please choose a category.";
    if (
      form.acquisitionCost &&
      !/^\d+(\.\d{1,2})?$/.test(form.acquisitionCost.replace(/[,\s]/g, ""))
    ) {
      next.acquisitionCost = "Enter a number, e.g. 1299.00";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  async function uploadPhoto(file: File): Promise<string | null> {
    const body = new FormData();
    body.append("file", file);
    const res = await fetch("/api/uploads", { method: "POST", body });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? "Photo upload failed.");
    }
    const data = (await res.json()) as { path: string };
    return data.path;
  }

  async function handleSubmit() {
    if (!validate()) return;
    setSubmitting(true);
    try {
      let photoPath: string | null = null;
      if (photo) photoPath = await uploadPhoto(photo);

      const result = await createAsset({
        name: form.name,
        categoryId: form.categoryId,
        serialNumber: form.serialNumber,
        acquisitionDate: form.acquisitionDate,
        acquisitionCost: form.acquisitionCost,
        condition: form.condition,
        location: form.location,
        isBookable: form.isBookable,
        photoPath,
        customValues,
      });

      if (!result.ok) {
        toast({ title: "Could not register asset", description: result.error, variant: "error" });
        return;
      }

      toast({
        title: `Asset registered — ${result.tag}`,
        description: `${form.name} added to the directory.`,
        variant: "success",
      });
      onOpenChange(false);
      router.refresh();
    } catch (error) {
      toast({
        title: "Could not register asset",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "error",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Register asset"
      description="Add a new item to the inventory. A tag and QR code are generated automatically."
      className="max-w-2xl"
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Loader2 className="animate-spin" /> : null}
            {submitting ? "Saving…" : "Register asset"}
          </Button>
        </>
      }
    >
      <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <InputField
            label="Name"
            required
            placeholder='e.g. Dell Latitude 5440'
            value={form.name}
            error={errors.name}
            onChange={(e) => set("name", e.target.value)}
            wrapperClassName="sm:col-span-2"
          />
          <SelectField
            label="Category"
            required
            placeholder="Select a category"
            options={categories.map((c) => ({ label: c.name, value: String(c.id) }))}
            value={form.categoryId}
            error={errors.categoryId}
            onValueChange={(v) => {
              set("categoryId", v);
              setCustomValues({}); // reset custom fields when category changes
            }}
          />
          <InputField
            label="Serial number"
            placeholder="e.g. DL5440-88213"
            value={form.serialNumber}
            onChange={(e) => set("serialNumber", e.target.value)}
          />
          <DatePickerField
            label="Acquisition date"
            value={form.acquisitionDate}
            onChange={(e) => set("acquisitionDate", e.target.value)}
          />
          <InputField
            label="Acquisition cost"
            placeholder="e.g. 1299.00"
            inputMode="decimal"
            value={form.acquisitionCost}
            error={errors.acquisitionCost}
            onChange={(e) => set("acquisitionCost", e.target.value)}
          />
          <InputField
            label="Condition"
            placeholder="e.g. good"
            value={form.condition}
            onChange={(e) => set("condition", e.target.value)}
          />
          <InputField
            label="Location"
            placeholder="e.g. HQ — Floor 2"
            value={form.location}
            onChange={(e) => set("location", e.target.value)}
          />
        </div>

        {/* Dynamic per-category custom fields */}
        {Object.keys(customFieldDefs).length > 0 ? (
          <div className="space-y-4 rounded-lg border border-border bg-background/40 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {selectedCategory?.name} details
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {Object.entries(customFieldDefs).map(([key, type]) => (
                <InputField
                  key={key}
                  label={humanizeKey(key)}
                  type={type === "number" ? "number" : "text"}
                  inputMode={type === "number" ? "numeric" : undefined}
                  value={customValues[key] ?? ""}
                  onChange={(e) =>
                    setCustomValues((prev) => ({ ...prev, [key]: e.target.value }))
                  }
                />
              ))}
            </div>
          </div>
        ) : null}

        {/* Photo upload */}
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-foreground">Photo</p>
          <label className="flex cursor-pointer items-center gap-3 rounded-md border border-dashed border-input bg-background px-4 py-3 text-sm text-muted-foreground transition-colors hover:border-zinc-600 hover:text-foreground">
            <Upload className="size-4 shrink-0" />
            <span className="truncate">
              {photo ? photo.name : "Upload an image (PNG, JPG, WebP — max 5 MB)"}
            </span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>

        {/* Shared / bookable */}
        <label className="flex items-center gap-3 text-sm text-foreground">
          <input
            type="checkbox"
            className="size-4 rounded border-input bg-background text-primary accent-emerald-500"
            checked={form.isBookable}
            onChange={(e) => set("isBookable", e.target.checked)}
          />
          <span>
            Shared / bookable
            <span className="ml-2 text-xs text-muted-foreground">
              Makes this asset reservable in Resource Booking.
            </span>
          </span>
        </label>
      </div>
    </Modal>
  );
}

/** "warranty_months" → "Warranty months". */
function humanizeKey(key: string): string {
  return key
    .split(/[_\s-]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
