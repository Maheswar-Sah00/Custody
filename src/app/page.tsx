export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-4xl font-bold tracking-tight">AssetFlow</h1>
      <p className="max-w-md text-center text-muted-foreground">
        Modular ERP for enterprise asset &amp; resource management. Core
        foundation is in place — feature modules plug into{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 text-sm">src/core</code>.
      </p>
    </main>
  );
}
