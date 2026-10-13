// Queries shared by several screens, so they read and refresh one cache entry.

import { queryOptions } from '@tanstack/react-query';

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
