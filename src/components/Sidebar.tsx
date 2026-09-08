"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-border bg-surface px-4 py-6">
      <div className="mb-8 flex items-center gap-2 px-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent text-accent-foreground font-semibold">
          B
        </div>
        <span className="text-[15px] font-semibold tracking-tight">Blocker</span>
      </div>

      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
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
      </nav>
    </aside>
  );
}
