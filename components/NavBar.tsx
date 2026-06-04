"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/actions/auth";

export function NavBar({
  title,
  links,
  userName,
}: {
  title: string;
  links: { href: string; label: string }[];
  userName: string;
}) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-6">
          <span className="font-bold text-slate-900">{title}</span>
          <nav className="flex items-center gap-1">
            {links.map((link) => {
              const active =
                pathname === link.href ||
                (link.href !== "/admin" && pathname.startsWith(link.href));
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                    active
                      ? "bg-primary-light text-primary"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500">{userName}</span>
          <form action={logout}>
            <button
              type="submit"
              className="rounded-lg px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            >
              יציאה
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
