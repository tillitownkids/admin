"use client";

import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";

import type { EpisodeLocationRow, SceneRow } from "@/components/episode-production/types";
import { queryKeys } from "@/lib/queryKeys";

// Stable empties, so effects that depend on the lists do not rerun on every render while loading.
const NO_SCENES: SceneRow[] = [];
const NO_LOCATIONS: EpisodeLocationRow[] = [];

async function fetchEpisodeScenes(storyId: string): Promise<{ scenes: SceneRow[]; episodeLocations: EpisodeLocationRow[] }> {
  const [locationsRes, scenesRes] = await Promise.all([
    fetch(`/api/episode-locations?storyId=${storyId}`),
    fetch(`/api/scenes?storyId=${storyId}`),
  ]);
  if (!locationsRes.ok || !scenesRes.ok) {
    throw new Error(`The episode's scenes could not be loaded (HTTP ${scenesRes.ok ? locationsRes.status : scenesRes.status}).`);
  }
  const episodeLocations: EpisodeLocationRow[] = (await locationsRes.json()).episodeLocations || [];
  const rawScenes: Omit<SceneRow, "locationName">[] = (await scenesRes.json()).scenes || [];
  return {
    episodeLocations,
    // Reference images are keyed by location name, so each scene carries its location's name.
    scenes: rawScenes.map((scene) => ({
      ...scene,
      locationName: episodeLocations.find((location) => location.id === scene.episode_location_id)?.Location?.name || "",
    })),
  };
}

/**
 * An episode's scenes (with their linked characters) and locations, for the storyboard and video steps.
 * Cached: opening the step again shows the last scenes at once while they refresh in the background.
 */
export function useEpisodeScenes(storyId: string) {
  const query = useQuery({
    queryKey: queryKeys.episodeScenes(storyId),
    queryFn: () => fetchEpisodeScenes(storyId),
  });
  const { refetch: refetchQuery } = query;
  const refetch = useCallback(async () => {
    await refetchQuery();
  }, [refetchQuery]);

  return {
    scenes: query.data?.scenes ?? NO_SCENES,
    episodeLocations: query.data?.episodeLocations ?? NO_LOCATIONS,
    isLoading: query.isPending,
    error: query.error ? (query.error instanceof Error ? query.error.message : "The episode's scenes could not be loaded.") : null,
    refetch,
  };
}
