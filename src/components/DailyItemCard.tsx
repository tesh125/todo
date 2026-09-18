"use client";

import { PreferenceDTO } from "@/lib/types";

export default function DailyItemCard({
  preference,
  onToggle,
}: {
  preference: PreferenceDTO;
  onToggle: (preference: PreferenceDTO) => void;
}) {
  return (
    <div className="group flex items-start gap-2.5 rounded-xl border border-border bg-surface px-3 py-2.5 shadow-sm transition-shadow hover:shadow-md">
      <button
        onClick={() => onToggle(preference)}
        aria-label="Toggle done for today"
        className={`mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
          preference.completedToday ? "border-accent bg-accent" : "border-border"
        }`}
        style={{ width: 18, height: 18 }}
      >
        {preference.completedToday && (
          <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none">
            <path d="M2 6l2.5 2.5L10 3" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      <p
        className={`min-w-0 flex-1 text-[13.5px] leading-snug ${
          preference.completedToday ? "text-muted line-through" : "text-foreground"
        }`}
      >
        {preference.text}
      </p>
    </div>
  );
}
