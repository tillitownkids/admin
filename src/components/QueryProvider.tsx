"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * The client-side data cache. A screen opened again shows what it loaded last time at once and
 * refreshes it in the background, instead of starting from an empty "Loading…" state.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        // Stale at once: a reopened screen shows its cached data immediately and always refreshes it
        // in the background, so a change made elsewhere (a deleted episode, a new image) shows up.
        staleTime: 0,
        // Kept for 10 minutes after a screen closes, so returning to it is instant.
        gcTime: 10 * 60_000,
        // Long AI and generation runs keep their own state; refocusing the tab should not reload under them.
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  }));
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
