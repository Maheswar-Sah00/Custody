"use client";

import * as React from "react";
import Link from "next/link";

import { Button, InputField } from "@/components";
import { AuthCard } from "../_components/auth-card";

interface ForgotResult {
  message: string;
  resetToken: string | null;
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [result, setResult] = React.useState<ForgotResult | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      setResult({ message: data.message, resetToken: data.resetToken ?? null });
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCard
      title="Reset your password"
      subtitle="Enter your email and we'll issue a reset token."
    >
      {result ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{result.message}</p>
          {result.resetToken ? (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-foreground">
                Your reset token (expires in 15 minutes):
              </p>
              <code className="block break-all rounded-md border border-border bg-background p-3 font-mono text-xs text-emerald-400">
                {result.resetToken}
              </code>
              <p className="text-xs text-muted-foreground">
                Use this token to set a new password.
              </p>
            </div>
          ) : null}
          <Button asChild variant="outline" className="w-full">
            <Link href="/login">Back to sign in</Link>
          </Button>
        </div>
      ) : (
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

          {error ? (
            <p className="text-sm font-medium text-destructive">{error}</p>
          ) : null}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Requesting…" : "Request reset token"}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            Remembered it?{" "}
            <Link
              href="/login"
              className="font-medium text-primary hover:underline"
            >
              Sign in
            </Link>
          </p>
        </form>
      )}
    </AuthCard>
  );
}
