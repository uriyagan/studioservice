"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { requestPasswordReset } from "@/app/actions/auth";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [resetting, startReset] = useTransition();

  const sendReset = () => {
    if (!email) {
      setError("הזן אימייל ואז לחץ על איפוס סיסמה");
      return;
    }
    setError(null);
    startReset(async () => {
      const fd = new FormData();
      fd.set("email", email);
      await requestPasswordReset({ ok: false }, fd);
      setForgotSent(true);
    });
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    // Persist the "remember me" preference so the middleware knows whether to
    // keep the auth cookies persistent or make them session-only.
    document.cookie = `remember=${remember ? "1" : "0"}; path=/; max-age=${60 * 60 * 24 * 400}; samesite=lax`;

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError("אימייל או סיסמה שגויים");
      setLoading(false);
      return;
    }

    // Middleware reroutes "/" to the correct home by role.
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.svg"
            alt="Uriya Ganor Studio"
            className="mx-auto h-20 w-auto"
          />
        </div>

        <Card>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                אימייל
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
                placeholder="name@example.com"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                סיסמה
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
                placeholder="••••••••"
              />
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-primary"
              />
              זכור אותי
            </label>

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                {error}
              </p>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full"
            >
              {loading ? "מתחבר..." : "כניסה"}
            </Button>

            <div className="text-center">
              {forgotSent ? (
                <p className="text-sm text-emerald-600">
                  אם קיים חשבון עם אימייל זה, נשלח אליו קישור לאיפוס סיסמה.
                </p>
              ) : forgot ? (
                <button
                  type="button"
                  onClick={sendReset}
                  disabled={resetting}
                  className="text-sm text-primary hover:underline disabled:opacity-50"
                >
                  {resetting ? "שולח..." : "שלח קישור לאיפוס לאימייל שמולא למעלה"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setForgot(true)}
                  className="text-sm text-slate-500 hover:text-slate-700 hover:underline"
                >
                  שכחת סיסמה?
                </button>
              )}
            </div>
          </form>
        </Card>
      </div>
    </main>
  );
}
