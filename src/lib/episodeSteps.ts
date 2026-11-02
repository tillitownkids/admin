// An episode moves through five steps in order. Everything that shows where an
// episode stands (the Episodes list, the stepper) derives it from these counts.

export const EPISODE_STEPS = [
  { key: 'story', label: 'Story' },
  { key: 'assets', label: 'Assets' },
  { key: 'script', label: 'Script' },
  // One place per sequence: its beats, storyboard, clip, issues and history.
  { key: 'sequences', label: 'Sequences' },
  // Stitch the clips into the episode, then upload it.
  { key: 'publish', label: 'Publish' },
] as const;

export type EpisodeStepKey = (typeof EPISODE_STEPS)[number]['key'];
export type EpisodeStepState = 'done' | 'active' | 'todo' | 'locked';

export interface EpisodeProgress {
  /** Assets: characters, locations and objects linked to the episode. "scenes" counts sequences. */
  assets: number;
  /** Assets with a reference sheet, which image and clip generation need. */
  assetsWithSheet: number;
  hasScript: boolean;
  scenes: number;
  scenesWithImage: number;
  /** Sequences that have at least one generated clip. */
  scenesWithClip: number;
  stitchedVideos: number;
  publishedVideos: number;
}

function isDone(step: EpisodeStepKey, progress: EpisodeProgress): boolean {
  switch (step) {
    case 'story': return true; // An episode exists once its story is saved.
    // Every asset has its sheet. An episode whose storyboard images are all made is past needing them.
    case 'assets':
      return (progress.assets > 0 && progress.assetsWithSheet === progress.assets)
        || (progress.scenes > 0 && progress.scenesWithImage === progress.scenes);
    case 'script': return progress.hasScript;
    // Every sequence has its clip, or the episode has already been stitched.
    case 'sequences': return (progress.scenes > 0 && progress.scenesWithClip === progress.scenes) || progress.stitchedVideos > 0;
    case 'publish': return progress.publishedVideos > 0;
  }
}

/** Whether the step has what it needs to be worked on. */
function isAvailable(step: EpisodeStepKey, progress: EpisodeProgress): boolean {
  switch (step) {
    case 'story': return true;
    case 'assets': return true;
    case 'script': return true;
    case 'sequences': return progress.hasScript;
    case 'publish': return progress.scenesWithClip > 0 || progress.stitchedVideos > 0;
  }
}

/** The first step that is not finished: where "Continue" goes. */
export function nextEpisodeStep(progress: EpisodeProgress): EpisodeStepKey {
  const next = EPISODE_STEPS.find((step) => !isDone(step.key, progress) && isAvailable(step.key, progress));
  return next?.key ?? 'publish';
}

export function episodeStepStates(progress: EpisodeProgress): Record<EpisodeStepKey, EpisodeStepState> {
  const active = nextEpisodeStep(progress);
  const states = {} as Record<EpisodeStepKey, EpisodeStepState>;
  for (const { key } of EPISODE_STEPS) {
    states[key] = isDone(key, progress) ? 'done' : !isAvailable(key, progress) ? 'locked' : key === active ? 'active' : 'todo';
  }
  return states;
}

/** What a locked step is waiting for, in the user's words. */
export function lockedStepReason(step: EpisodeStepKey): string {
  switch (step) {
    case 'sequences': return 'Write the script first.';
    case 'publish': return 'Make at least one clip first.';
    default: return '';
  }
}

/** One line describing how far the episode's current step has got. */
export function episodeStatusLine(progress: EpisodeProgress): string {
  switch (nextEpisodeStep(progress)) {
    case 'story': return 'Story saved';
    case 'assets': {
      if (!progress.assets) return 'No characters, locations or objects linked yet';
      const missing = progress.assets - progress.assetsWithSheet;
      return `${missing} of ${progress.assets} assets need a sheet`;
    }
    case 'script': return 'Script not written yet';
    case 'sequences':
      if (progress.scenes === 0) return 'Sequences not planned yet';
      if (progress.scenesWithImage < progress.scenes) return `${progress.scenesWithImage} of ${progress.scenes} storyboards`;
      return `Clips for ${progress.scenesWithClip} of ${progress.scenes} sequences`;
    case 'publish':
      return progress.publishedVideos > 0 ? 'Published' : progress.stitchedVideos > 0 ? 'Ready to publish' : 'Ready to stitch';
  }
}

/** A story's own title: its first heading, else the saved topic. */
export function episodeTitle(story: { content?: string | null; topic?: string | null }): string {
  const content = story.content || '';
  const heading = content.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? content.match(/^\s*#\s+(.+)$/m)?.[1];
  const title = (heading || '').replace(/<[^>]+>/g, '').replace(/[*_`]/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  return title || (story.topic || '').trim() || 'Untitled episode';
}
