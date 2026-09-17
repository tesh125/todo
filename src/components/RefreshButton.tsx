"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export default function RefreshButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function refresh() {
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <button
      onClick={refresh}
      disabled={isPending}
      className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[12.5px] font-medium text-foreground hover:bg-accent-soft disabled:opacity-60"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`}
      >
        <path
          d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M4 4v5h5M20 20v-5h-5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {isPending ? "Syncing…" : "Refresh"}
    </button>
  );
}
