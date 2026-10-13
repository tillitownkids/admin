"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/queryKeys";

/**
 * Keeps the episode's cached client data in step with the server. The episode layout renders this
 * with a version made from the episode's last change and progress; after any change that refreshes
 * the page (a new plan, image, clip or cast) the version moves, and every cached view of the episode
 * reloads in the background. The episodes list and dashboard are refreshed too.
 */
export function EpisodeCacheSync({ storyId, version }: { storyId: string; version: string }) {
  const queryClient = useQueryClient();
  const seen = useRef(version);

  useEffect(() => {
    if (seen.current === version) return;
    seen.current = version;
    void queryClient.invalidateQueries({ queryKey: queryKeys.episode(storyId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.episodes() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard() });
  }, [queryClient, storyId, version]);

  return null;
}
