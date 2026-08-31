'use client';

import { useEffect, useState, use } from 'react';
import { Clapperboard, CheckCircle2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { GlassPanel } from '@/components/GlassPanel';
import { ProductionStepper, type ProductionStageKey } from '@/components/episode-production/ProductionStepper';
import { LocationsStage } from '@/components/episode-production/LocationsStage';
import { ReferencesStage } from '@/components/episode-production/ReferencesStage';
import { ScenesStage } from '@/components/episode-production/ScenesStage';
import { StoryboardsStage } from '@/components/episode-production/StoryboardsStage';
import { VideoStage } from '@/components/episode-production/VideoStage';


import type {
  StoryRow,
  EpisodeLocationRow,
  SceneRow,
  CharacterRow,
  LocationLibraryRow,
} from '@/components/episode-production/types';

function defaultActiveStage(stage: string): ProductionStageKey {
  if (stage === 'story' || stage === 'locations') return 'locations';
  if (stage === 'references' || stage === 'stylesheets') return 'references';
  if (stage === 'scenes') return 'scenes';
  if (stage === 'storyboards') return 'storyboards';
  return 'video';
}

export default function EpisodeProductionPage({ params }: { params: Promise<{ storyId: string }> }) {
  const { storyId } = use(params);

  const [story, setStory] = useState<StoryRow | null>(null);
  const [episodeLocations, setEpisodeLocations] = useState<EpisodeLocationRow[]>([]);
  const [scenes, setScenes] = useState<SceneRow[]>([]);
  const [characters, setCharacters] = useState<CharacterRow[]>([]);
  const [locationLibrary, setLocationLibrary] = useState<LocationLibraryRow[]>([]);
  const [activeStage, setActiveStage] = useState<ProductionStageKey>('locations');
  const [isLoading, setIsLoading] = useState(true);

  const fetchStory = async (): Promise<StoryRow | null> => {
    const res = await fetch(`/api/stories/${storyId}`);
    if (!res.ok) return null;
    const data = await res.json();
    setStory(data.story);
    return data.story;
  };

  const fetchEpisodeLocations = async (): Promise<EpisodeLocationRow[]> => {
    const res = await fetch(`/api/episode-locations?storyId=${storyId}`);
    if (!res.ok) return [];
    const data = await res.json();
    const locs = data.episodeLocations || [];
    setEpisodeLocations(locs);
    return locs;
  };

  const fetchCharacters = async () => {
    const res = await fetch('/api/characters');
    if (res.ok) {
      const data = await res.json();
      setCharacters(data.characters || []);
    }
  };

  const fetchLocationLibrary = async () => {
    const res = await fetch('/api/locations');
    if (res.ok) {
      const data = await res.json();
      setLocationLibrary(data.locations || []);
    }
  };

  const fetchScenes = async (locations: EpisodeLocationRow[]) => {
    if (locations.length === 0) {
      setScenes([]);
      return;
    }
    const entries = await Promise.all(
      locations.map(async (el) => {
        const res = await fetch(`/api/scenes?episodeLocationId=${el.id}`);
        const data = res.ok ? await res.json() : { scenes: [] };
        return (data.scenes || []).map((s: Omit<SceneRow, 'locationName'>) => ({ ...s, locationName: el.Location.name }));
      })
    );
    setScenes(entries.flat());
  };

  const patchStage = async (stage: string) => {
    const res = await fetch(`/api/stories/${storyId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ production_stage: stage }),
    });
    if (res.ok) {
      const data = await res.json();
      setStory(data.story);
    }
  };

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      const loadedStory = await fetchStory();
      const loadedLocations = await fetchEpisodeLocations();
      await Promise.all([fetchCharacters(), fetchLocationLibrary(), fetchScenes(loadedLocations)]);

      let stage = loadedStory?.production_stage || 'story';
      if (stage === 'story') {
        await patchStage('locations');
        stage = 'locations';
      }
      setActiveStage(defaultActiveStage(stage));
      setIsLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storyId]);

  if (isLoading || !story) {
    return (
      <div className="max-w-[1200px] w-full mx-auto space-y-6 page-enter pb-10">
        <p className="text-muted-foreground">Loading production workspace...</p>
      </div>
    );
  }

  const isComplete = story.production_stage === 'complete';

  return (
    <div className="max-w-[1200px] w-full mx-auto space-y-6 page-enter pb-10">
      <PageHeader
        icon={Clapperboard}
        title={story.topic || 'Untitled Episode'}
        highlight="Production"
        description="Walk through locations, references, scenes, storyboards, and video generation for this episode."
      />

      {isComplete && (
        <div className="p-4 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          <span className="text-sm font-medium">Production complete for this episode.</span>
        </div>
      )}

      <ProductionStepper currentStage={story.production_stage} activeStage={activeStage} onSelectStage={setActiveStage} />

      <GlassPanel>
        {activeStage === 'locations' && (
          <LocationsStage
            storyId={storyId}
            storyContent={story.content}
            episodeLocations={episodeLocations}
            locationLibrary={locationLibrary}
            onConfirmed={async () => {
              const locs = await fetchEpisodeLocations();
              await fetchScenes(locs);
              await patchStage('references');
              setActiveStage('references');
            }}
          />
        )}

        {activeStage === 'references' && (
          <ReferencesStage
            episodeLocations={episodeLocations}
            characters={characters}
            onConfirmed={async () => {
              await patchStage('scenes');
              setActiveStage('scenes');
            }}
          />
        )}

        {activeStage === 'scenes' && (
          <ScenesStage
            episodeLocations={episodeLocations}
            scenes={scenes}
            onRefetchScenes={async () => {
              await fetchScenes(episodeLocations);
            }}
            onAllDetected={async () => {
              await patchStage('storyboards');
              setActiveStage('storyboards');
            }}
          />
        )}

        {activeStage === 'storyboards' && (
          <StoryboardsStage
            scenes={scenes}
            characters={characters}
            episodeLocations={episodeLocations}
            onRefetchScenes={async () => {
              await fetchScenes(episodeLocations);
            }}
            onConfirmed={async () => {
              await patchStage('video');
              setActiveStage('video');
            }}
          />
        )}


        {activeStage === 'video' && (
          <VideoStage
            scenes={scenes}
            characters={characters}
            episodeLocations={episodeLocations}
            onRefetchScenes={async () => {
              await fetchScenes(episodeLocations);
            }}
            onConfirmed={async () => {
              await patchStage('complete');
            }}
          />
        )}

      </GlassPanel>
    </div>
  );
}

