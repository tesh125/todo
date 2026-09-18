"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const NAV_ITEMS = [
  {
    href: "/",
    label: "Today",
    icon: (active: boolean) => (
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
        <path
          d="M4 6h16M4 12h16M4 18h10"
          stroke={active ? "var(--accent-foreground)" : "currentColor"}
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    href: "/calendar",
    label: "Time Blocks",
    icon: (active: boolean) => (
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
        <rect
          x="3.5"
          y="5"
          width="17"
          height="15"
          rx="3"
          stroke={active ? "var(--accent-foreground)" : "currentColor"}
          strokeWidth="1.8"
        />
        <path
          d="M3.5 9.5h17M8 3v3.5M16 3v3.5"
          stroke={active ? "var(--accent-foreground)" : "currentColor"}
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    href: "/preferences",
    label: "Preferences",
    icon: (active: boolean) => (
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
        <circle
          cx="12"
          cy="12"
          r="8.5"
          stroke={active ? "var(--accent-foreground)" : "currentColor"}
          strokeWidth="1.8"
        />
        <path
          d="M9 12.5l2 2 4-4.5"
          stroke={active ? "var(--accent-foreground)" : "currentColor"}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
];

function Brand() {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground font-semibold text-[13px]">
        TB
      </div>
      <span className="text-[15px] font-semibold tracking-tight">Todo Blocker</span>
    </div>
  );
}

function NavLinks({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate: () => void;
}) {
  return (
    <>
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
              active
                ? "bg-accent text-accent-foreground shadow-sm"
                : "text-muted hover:bg-accent-soft hover:text-foreground"
            }`}
          >
            {item.icon(active)}
            {item.label}
          </Link>
        );
      })}
    </>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  // Tapping a nav link (Today, Time Blocks, Preferences) closes the mobile
  // menu via onNavigate below, so it shows that page full-screen instead of
  // leaving the menu covering it.
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Desktop / tablet: persistent left sidebar */}
      <aside className="hidden h-full w-60 shrink-0 flex-col border-r border-border bg-surface px-4 py-6 md:flex">
        <div className="mb-8 px-2">
          <Brand />
        </div>
        <nav className="flex flex-col gap-1">
          <NavLinks pathname={pathname} onNavigate={() => {}} />
        </nav>
      </aside>

      {/* Mobile: top bar with a hamburger menu in the top-right corner */}
      <div className="sticky top-0 z-40 w-full border-b border-border bg-surface md:hidden">
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top, 0px))" }}
        >
          <Brand />
          <button
            onClick={() => setMobileOpen((open) => !open)}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-foreground hover:bg-accent-soft"
          >
            {mobileOpen ? (
              <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
                <path d="M5 5l14 14M19 5L5 19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
                <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            )}
          </button>
        </div>

        {mobileOpen && (
          <nav className="flex flex-col gap-1 border-t border-border px-3 pb-3 pt-2">
            <NavLinks pathname={pathname} onNavigate={() => setMobileOpen(false)} />
          </nav>
        )}
      </div>
    </>
  );
}
