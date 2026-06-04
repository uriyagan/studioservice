import { ReactNode } from "react";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white p-6 shadow-card ${className}`}
    >
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: ReactNode;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-5 shadow-card ${
        accent
          ? "border-primary/20 bg-primary-light"
          : "border-slate-200 bg-white"
      }`}
    >
      <p className="text-sm text-slate-500">{label}</p>
      <p
        className={`mt-2 text-2xl font-bold ${
          accent ? "text-primary" : "text-slate-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
