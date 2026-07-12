import { redirect } from "next/navigation";

/**
 * Root entry: send visitors into the app. The (app) layout redirects to
 * /login when there's no session, so this resolves to dashboard-or-login.
 */
export default function Home() {
  redirect("/dashboard");
}
