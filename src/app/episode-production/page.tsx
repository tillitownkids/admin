'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Clapperboard } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { getSavedStoryboardsAction } from '@/actions/saveStoryboardAction';


const STAGE_LABELS: Record<string, string> = {
  story: 'Not Started',
  locations: 'Locations',
  stylesheets: 'Stylesheets',
  scenes: 'Scenes',
  storyboards: 'Storyboards',
  beats: 'Beats',
  complete: 'Complete',
};

interface SavedStoryboardRow {
  id: string;
  topic: string;
  episode_number: string;
  production_stage?: string;
  generated_at: string;
}

export default function EpisodeProductionIndexPage() {
  const [storyboards, setStoryboards] = useState<SavedStoryboardRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setIsLoading(true);
        const res = await getSavedStoryboardsAction();
        if (res.success && res.storyboards) {
          setStoryboards(res.storyboards);
        }
      } catch (e) {
        console.error('Failed to load production storyboards', e);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  return (
    <div className="max-w-[1200px] w-full mx-auto space-y-6 page-enter pb-10">
      <PageHeader
        icon={Clapperboard}
        title="Episode"
        highlight="Production"
        description="Turn an episode story into locations, stylesheets, storyboards, and a scene-by-scene shot script."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {!isLoading && storyboards.length === 0 && (
          <p className="text-sm text-muted-foreground col-span-full">
            No episodes with saved storyboards found. Create a storyboard in Storyboard Generator first.
          </p>
        )}

        {storyboards.map((sb) => (
          <Link
            key={sb.id}
            href={`/episode-production/${sb.id}`}
            className="flex flex-col p-5 rounded-2xl border border-border bg-card min-h-[160px] hover:border-primary/40 transition-colors"
          >
            <span className="inline-flex items-center gap-1.5 self-start px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-primary/10 text-primary mb-3">
              {sb.episode_number ? `Episode ${sb.episode_number}` : 'Episode'}
            </span>
            <h3 className="text-lg font-bold text-foreground line-clamp-2">{sb.topic || 'Untitled Storyboard'}</h3>
            <p className="text-sm text-muted-foreground mt-auto pt-4">
              {new Date(sb.generated_at).toLocaleDateString()}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}

