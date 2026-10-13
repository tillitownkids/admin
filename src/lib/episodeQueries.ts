// Queries shared by several screens, so they read and refresh one cache entry.

import { queryOptions } from '@tanstack/react-query';

import { getEpisodeObjectsAction } from '@/actions/propsAction';
import { getScriptByIdAction } from '@/actions/saveScriptAction';
import { getStoriesAction, getStoryByIdAction, getStoryCharactersAndLocationsAction } from '@/actions/saveStoryAction';
import { getStoryboardByStoryIdAction } from '@/actions/saveStoryboardAction';
import { queryKeys } from '@/lib/queryKeys';

/** The episode's script, scenes, cast and locations: the prompt editor and the stitcher both read it. */
export function storyboardQuery(storyId: string) {
  return queryOptions({
    queryKey: queryKeys.episodeStoryboard(storyId),
    queryFn: async () => {
      const res = await getStoryboardByStoryIdAction(storyId);
      if (!res.success) throw new Error(res.error || 'Failed to load storyboard data.');
      return res;
    },
    enabled: Boolean(storyId),
  });
}

/** The story with its cast and locations: the Story editor, the Script step and the storyboard planner read it. */
export function storyQuery(storyId: string) {
  return queryOptions({
    queryKey: queryKeys.episodeStory(storyId),
    queryFn: async () => {
      const [storyRes, details] = await Promise.all([
        getStoryByIdAction(storyId),
        getStoryCharactersAndLocationsAction(storyId),
      ]);
      if (!storyRes.success || !storyRes.story) throw new Error(storyRes.error || 'Failed to load story details.');
      return {
        // Stories are untyped rows; the screens read the fields they need.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        story: storyRes.story as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        characters: (details.success ? details.characters || [] : []) as any[],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        locations: (details.success ? details.locations || [] : []) as any[],
      };
    },
    enabled: Boolean(storyId),
  });
}

/** One beat script: the Script editor and the storyboard planner read it. */
export function scriptQuery(scriptId: string) {
  return queryOptions({
    queryKey: queryKeys.episodeScript(scriptId),
    queryFn: async () => {
      const res = await getScriptByIdAction(scriptId);
      if (!res.success || !res.script) throw new Error(res.error || 'Failed to load script details.');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return res.script as any;
    },
    enabled: Boolean(scriptId),
  });
}

/** The objects (props) linked to an episode. */
export function episodeObjectsQuery(storyId: string) {
  return queryOptions({
    queryKey: queryKeys.episodeObjects(storyId),
    queryFn: () => getEpisodeObjectsAction(storyId),
    enabled: Boolean(storyId),
  });
}

/** A library list as its API returns it, e.g. { characters: [...] }. The library pages share it. */
export function libraryQuery(apiPath: string) {
  return queryOptions({
    queryKey: queryKeys.library(apiPath),
    queryFn: async (): Promise<Record<string, unknown>> => {
      const res = await fetch(apiPath);
      if (!res.ok) throw new Error(`The list could not be loaded (HTTP ${res.status}).`);
      return res.json();
    },
  });
}

/** Every story. */
export function storiesQuery() {
  return queryOptions({
    queryKey: queryKeys.stories(),
    queryFn: async () => {
      const res = await getStoriesAction();
      if (!res.success) throw new Error(res.error || 'The stories could not be loaded.');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (res.stories || []) as any[];
    },
  });
}
