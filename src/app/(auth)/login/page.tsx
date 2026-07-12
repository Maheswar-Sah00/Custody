"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button, InputField } from "@/components";
import { AuthCard } from "../_components/auth-card";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Unable to sign in. Please try again.");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCard title="Sign in to AssetFlow" subtitle="Welcome back.">
      <form onSubmit={onSubmit} className="space-y-4">
        <InputField
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">Password</span>
            <Link
              href="/forgot-password"
              className="text-xs font-medium text-primary hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <InputField
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        {error ? (
          <p className="text-sm font-medium text-destructive">{error}</p>
        ) : null}

        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <div className="my-6 flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">or</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <div className="space-y-3 text-center">
        <p className="text-sm text-muted-foreground">
          New here? Sign up creates an employee account — admin roles assigned
          later.
        </p>
        <Button asChild variant="outline" className="w-full">
          <Link href="/signup">Create Account</Link>
        </Button>
      </div>
    </AuthCard>
  );
}
