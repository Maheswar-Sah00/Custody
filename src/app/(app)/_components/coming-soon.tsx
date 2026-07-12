import { PageHeader } from "@/components";

/**
 * Placeholder body for routes whose feature screen isn't built yet. Each route
 * owner replaces their page's contents; this keeps links from 404ing and shows
 * the shell + design system in the meantime.
 */
export function ComingSoon({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <div className="flex min-h-[50vh] flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/40 text-center">
        <p className="text-lg font-medium text-foreground">
          {title} — coming soon
        </p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          This screen is under construction. The AssetFlow shell and shared
          components are ready for it to build on.
        </p>
      </div>
    </>
  );
}
