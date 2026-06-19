"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { deleteClient } from "@/app/actions/clients";
import { Button } from "@/components/ui/Button";
import { Trash2, Loader2 } from "@/components/icons";

const initial = { ok: false, error: undefined as string | undefined };

function Btn() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="ghost"
      disabled={pending}
      className="text-red-600 hover:bg-red-50"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
      מחיקת לקוח
    </Button>
  );
}

export function DeleteClientButton({ clientId, name }: { clientId: string; name: string }) {
  const [state, action] = useActionState(deleteClient, initial);
  const router = useRouter();

  useEffect(() => {
    if (state.ok) router.push("/admin/clients");
  }, [state.ok, router]);

  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (
          !confirm(
            `למחוק את הלקוח "${name}"? הפעולה בלתי הפיכה. הפרויקטים יישמרו אך ינותקו מהלקוח.`
          )
        )
          e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={clientId} />
      <Btn />
      {state.error && <p className="mt-2 text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
