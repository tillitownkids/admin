// Cache keys for client-side data. Everything about one episode sits under ["episode", id], so
// `invalidateQueries({ queryKey: queryKeys.episode(id) })` refreshes all of it after a change.

export const queryKeys = {
  episodes: () => ['episodes'] as const,
  dashboard: () => ['dashboard'] as const,
  /** Every story, for numbering and previous-episode context. */
  stories: () => ['stories'] as const,
  credits: () => ['credits'] as const,
  settings: () => ['settings'] as const,
  /** A library list: characters, locations or objects, by its API path. */
  library: (apiPath: string) => ['library', apiPath] as const,
  episode: (storyId: string) => ['episode', storyId] as const,
  episodeScenes: (storyId: string) => ['episode', storyId, 'scenes'] as const,
  episodeStoryboard: (storyId: string) => ['episode', storyId, 'storyboard'] as const,
  /** The story with its cast and locations. */
  episodeStory: (storyId: string) => ['episode', storyId, 'story'] as const,
  episodeObjects: (storyId: string) => ['episode', storyId, 'objects'] as const,
  episodeScript: (scriptId: string) => ['script', scriptId] as const,
  episodeVideos: (storyId: string) => ['episode', storyId, 'videos'] as const,
  /** Generated image takes of some owners (scenes, characters, locations, objects). */
  imageTakes: (ownerType: string, ownerIds: string) => ['image-takes', ownerType, ownerIds] as const,
};
