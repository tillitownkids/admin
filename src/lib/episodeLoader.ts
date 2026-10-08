import { cache } from "react";

import { getEpisodeAction } from "@/actions/episodesAction";

/** One load per request: the episode layout and the step page below it both need the episode. */
export const loadEpisode = cache((storyId: string) => getEpisodeAction(storyId));
