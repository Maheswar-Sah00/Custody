import { redirect } from "next/navigation";

import { getSession } from "@/core/auth/session";

/** Centered shell for the auth screens. Signed-in users skip straight to app. */
export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (session) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
