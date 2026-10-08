// An episode moves through five steps in order. Everything that shows where an
// episode stands (the Episodes list, the stepper) derives it from these counts.

export const EPISODE_STEPS = [
  { key: 'story', label: 'Story' },
  { key: 'script', label: 'Script' },
  { key: 'storyboard', label: 'Storyboard' },
  { key: 'video', label: 'Video' },
  { key: 'publish', label: 'Publish' },
] as const;

export type EpisodeStepKey = (typeof EPISODE_STEPS)[number]['key'];
export type EpisodeStepState = 'done' | 'active' | 'todo' | 'locked';

export interface EpisodeProgress {
  hasScript: boolean;
  scenes: number;
  scenesWithImage: number;
  /** Scenes that have at least one generated clip. */
  scenesWithClip: number;
  stitchedVideos: number;
  publishedVideos: number;
}

function isDone(step: EpisodeStepKey, progress: EpisodeProgress): boolean {
  switch (step) {
    case 'story': return true; // An episode exists once its story is saved.
    case 'script': return progress.hasScript;
    case 'storyboard': return progress.scenes > 0 && progress.scenesWithImage === progress.scenes;
    case 'video': return progress.stitchedVideos > 0;
    case 'publish': return progress.publishedVideos > 0;
  }
}

/** Whether the step has what it needs to be worked on. */
function isAvailable(step: EpisodeStepKey, progress: EpisodeProgress): boolean {
  switch (step) {
    case 'story': return true;
    case 'script': return true;
    case 'storyboard': return progress.hasScript;
    case 'video': return progress.scenesWithImage > 0;
    case 'publish': return progress.stitchedVideos > 0;
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
    case 'storyboard': return 'Generate the script first.';
    case 'video': return 'Generate at least one storyboard image first.';
    case 'publish': return 'Stitch the episode video first.';
    default: return '';
  }
}

/** One line describing how far the episode's current step has got. */
export function episodeStatusLine(progress: EpisodeProgress): string {
  switch (nextEpisodeStep(progress)) {
    case 'story': return 'Story saved';
    case 'script': return 'Script not written yet';
    case 'storyboard':
      return progress.scenes === 0
        ? 'Storyboard not started'
        : `${progress.scenesWithImage} of ${progress.scenes} storyboard images`;
    case 'video':
      return progress.scenesWithClip === 0
        ? 'No clips yet'
        : `Clips for ${progress.scenesWithClip} of ${progress.scenes} scenes, not stitched`;
    case 'publish':
      return progress.publishedVideos > 0 ? 'Published' : 'Ready to publish';
  }
}

/** A story's own title: its first heading, else the saved topic. */
export function episodeTitle(story: { content?: string | null; topic?: string | null }): string {
  const content = story.content || '';
  const heading = content.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? content.match(/^\s*#\s+(.+)$/m)?.[1];
  const title = (heading || '').replace(/<[^>]+>/g, '').replace(/[*_`]/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  return title || (story.topic || '').trim() || 'Untitled episode';
}
