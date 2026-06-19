"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { logout } from "@/app/actions/auth";
import { LogOut, X } from "@/components/icons";

function MenuIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

export function NavBar({
  title,
  logoSrc,
  links,
  userName,
}: {
  title: string;
  logoSrc?: string;
  links: { href: string; label: string }[];
  userName: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close the mobile menu whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const isActive = (href: string) =>
    pathname === href || (href !== "/admin" && pathname.startsWith(href));

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-6">
          {logoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoSrc} alt={title} className="h-8 w-auto shrink-0" />
          ) : (
            <span className="font-bold text-slate-900">{title}</span>
          )}
          {/* Desktop nav */}
          <nav className="hidden items-center gap-1 md:flex">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                  isActive(link.href)
                    ? "bg-primary-light text-primary"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden max-w-[140px] truncate text-sm text-slate-500 sm:block">
            {userName}
          </span>
          <form action={logout} className="hidden md:block">
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            >
              <LogOut className="h-4 w-4" /> יציאה
            </button>
          </form>
          {/* Mobile menu toggle */}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label="תפריט"
            className="rounded-lg p-2 text-slate-700 hover:bg-slate-100 md:hidden"
          >
            {open ? <X className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <nav className="border-t border-slate-200 bg-white px-3 py-2 md:hidden">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`block rounded-lg px-3 py-2.5 text-sm font-medium ${
                isActive(link.href)
                  ? "bg-primary-light text-primary"
                  : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              {link.label}
            </Link>
          ))}
          <div className="mt-1 border-t border-slate-100 pt-1">
            <p className="px-3 py-1 text-xs text-slate-400">{userName}</p>
            <form action={logout}>
              <button
                type="submit"
                className="flex w-full items-center gap-1.5 rounded-lg px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-100"
              >
                <LogOut className="h-4 w-4" /> יציאה
              </button>
            </form>
          </div>
        </nav>
      )}
    </header>
  );
}
