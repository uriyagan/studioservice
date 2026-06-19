"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useActionState } from "react";
import { savePackage, deletePackage } from "@/app/actions/packages";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { HourPackageRow } from "@/lib/types";

const initial = { ok: false, error: undefined as string | undefined };
const cls =
  "w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30";

function SaveBtn({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "שומר..." : label}
    </Button>
  );
}

function PackageForm({ pkg }: { pkg?: HourPackageRow }) {
  const [state, action] = useActionState(savePackage, initial);
  return (
    <form action={action} className="grid items-end gap-3 sm:grid-cols-5">
      {pkg && <input type="hidden" name="id" value={pkg.id} />}
      <div className="sm:col-span-2">
        <label className="mb-1 block text-xs text-slate-500">שם החבילה</label>
        <input name="name" defaultValue={pkg?.name ?? ""} className={cls} required />
      </div>
      <div>
        <label className="mb-1 block text-xs text-slate-500">שעות</label>
        <input name="hours" type="number" step="0.5" min="0" defaultValue={pkg?.hours ?? ""} className={cls} required />
      </div>
      <div>
        <label className="mb-1 block text-xs text-slate-500">מחיר (€)</label>
        <input name="price_ils" type="number" step="1" min="0" defaultValue={pkg?.price_ils ?? ""} className={cls} required />
      </div>
      <div>
        <label className="mb-1 block text-xs text-slate-500">סדר</label>
        <input name="sort" type="number" defaultValue={pkg?.sort ?? 0} className={cls} />
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
        <input type="checkbox" name="active" defaultChecked={pkg ? pkg.active : true} className="h-4 w-4 rounded border-slate-300 text-primary" />
        פעילה (מוצגת ללקוח)
      </label>
      <div className="flex items-center gap-2 sm:col-span-3 sm:justify-end">
        {state.error && <span className="text-sm text-red-600">{state.error}</span>}
        {state.ok && <span className="text-sm text-emerald-600">נשמר ✓</span>}
        <SaveBtn label={pkg ? "עדכון" : "הוספת חבילה"} />
      </div>
    </form>
  );
}

function DeleteForm({ id }: { id: string }) {
  const [, action] = useActionState(deletePackage, initial);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm("למחוק את החבילה?")) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="ghost" className="text-red-600 hover:bg-red-50">
        מחק
      </Button>
    </form>
  );
}

export function PackagesManager({ packages }: { packages: HourPackageRow[] }) {
  const [showNew, setShowNew] = useState(false);
  // close the "new" form after a successful add (re-render brings new pkg in)
  useEffect(() => {
    setShowNew(false);
  }, [packages.length]);

  return (
    <div className="space-y-4">
      {packages.map((p) => (
        <Card key={p.id}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="min-w-0 truncate font-medium text-slate-800">
              {p.name} {!p.active && <span className="text-xs text-slate-400">(כבויה)</span>}
            </span>
            <span className="shrink-0">
              <DeleteForm id={p.id} />
            </span>
          </div>
          <PackageForm pkg={p} />
        </Card>
      ))}

      {showNew ? (
        <Card>
          <h3 className="mb-3 font-semibold text-slate-900">חבילה חדשה</h3>
          <PackageForm />
        </Card>
      ) : (
        <Button variant="secondary" onClick={() => setShowNew(true)}>
          + חבילה חדשה
        </Button>
      )}
    </div>
  );
}
