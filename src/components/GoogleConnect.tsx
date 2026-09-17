"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function GoogleConnect({
  connected,
  email,
  error,
}: {
  connected: boolean;
  email: string | null;
  error: string | null;
}) {
  const router = useRouter();
  const [disconnecting, setDisconnecting] = useState(false);

  async function disconnect() {
    setDisconnecting(true);
    await fetch("/api/auth/google/disconnect", { method: "POST" });
    setDisconnecting(false);
    router.refresh();
  }

  if (connected) {
    return (
      <div className="flex items-center gap-2 text-[12.5px]">
        <span className="flex items-center gap-1.5 rounded-full bg-preference-soft px-2.5 py-1 font-medium" style={{ color: "var(--preference)" }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "var(--preference)" }} />
          {email ?? "Connected"}
        </span>
        <button onClick={disconnect} disabled={disconnecting} className="text-muted underline hover:text-foreground">
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <a
        href="/api/auth/google"
        className="rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-medium text-accent-foreground"
      >
        Connect Google Calendar
      </a>
      {error && <span className="text-[12px] text-red-500">Couldn&apos;t connect. Try again.</span>}
    </div>
  );
}
