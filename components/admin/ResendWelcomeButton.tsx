"use client";

import { useState } from "react";
import { resendWelcome } from "@/app/actions/clients";
import { Button } from "@/components/ui/Button";

export function ResendWelcomeButton({ clientId }: { clientId: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [err, setErr] = useState<string | null>(null);

  const send = async () => {
    setState("sending");
    setErr(null);
    const r = await resendWelcome(clientId);
    if (r.ok) {
      setState("sent");
      setTimeout(() => setState("idle"), 4000);
    } else {
      setState("idle");
      setErr(r.error ?? "השליחה נכשלה");
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="secondary" onClick={send} disabled={state === "sending"}>
        {state === "sending" ? "שולח…" : state === "sent" ? "נשלח ✓" : "שליחת קישור להגדרת סיסמה"}
      </Button>
      {err && <span className="text-sm text-red-600">{err}</span>}
    </div>
  );
}
