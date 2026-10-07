'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Clapperboard, Loader2 } from 'lucide-react';
import { getSavedStoryboardsAction } from '@/actions/saveStoryboardAction';


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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading && (
          <div className="col-span-full py-12 flex flex-col items-center justify-center text-muted-foreground gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <p className="text-sm">Fetching video productions from database...</p>
          </div>
        )}

        {!isLoading && storyboards.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed border-border bg-card px-6 py-10 text-center">
            <Clapperboard className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <h3 className="font-semibold">Start your first episode</h3>
            <p className="mt-2 text-sm text-muted-foreground">Generate a story, create its script, then save a storyboard to begin production.</p>
            <Link href="/episode-production/stories" className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Generate a story <ArrowRight className="h-4 w-4" /></Link>
          </div>
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

