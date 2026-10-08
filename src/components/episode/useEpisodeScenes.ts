"use client";

import { useCallback, useEffect, useState } from "react";

import type { EpisodeLocationRow, SceneRow } from "@/components/episode-production/types";

/** An episode's scenes (with their linked characters) and locations, for the storyboard and video steps. */
export function useEpisodeScenes(storyId: string) {
  const [scenes, setScenes] = useState<SceneRow[]>([]);
  const [episodeLocations, setEpisodeLocations] = useState<EpisodeLocationRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    try {
      const [locationsRes, scenesRes] = await Promise.all([
        fetch(`/api/episode-locations?storyId=${storyId}`),
        fetch(`/api/scenes?storyId=${storyId}`),
      ]);
      if (!locationsRes.ok || !scenesRes.ok) {
        throw new Error(`The episode's scenes could not be loaded (HTTP ${scenesRes.ok ? locationsRes.status : scenesRes.status}).`);
      }
      const locations: EpisodeLocationRow[] = (await locationsRes.json()).episodeLocations || [];
      const rawScenes: Omit<SceneRow, "locationName">[] = (await scenesRes.json()).scenes || [];

      setEpisodeLocations(locations);
      // Reference images are keyed by location name, so each scene carries its location's name.
      setScenes(rawScenes.map((scene) => ({
        ...scene,
        locationName: locations.find((location) => location.id === scene.episode_location_id)?.Location?.name || "",
      })));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The episode's scenes could not be loaded.");
    } finally {
      setIsLoading(false);
    }
  }, [storyId]);

  useEffect(() => {
    (async () => {
      await refetch();
    })();
  }, [refetch]);

  return { scenes, episodeLocations, isLoading, error, refetch };
}
