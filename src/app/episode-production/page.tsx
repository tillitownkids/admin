'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Clapperboard } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';

const STAGE_LABELS: Record<string, string> = {
  story: 'Not Started',
  locations: 'Locations',
  stylesheets: 'Stylesheets',
  scenes: 'Scenes',
  storyboards: 'Storyboards',
  beats: 'Beats',
  complete: 'Complete',
};

interface StoryRow {
  id: string;
  topic: string;
  mode: string;
  status: string;
  production_stage: string;
  generated_at: string;
}

export default function EpisodeProductionIndexPage() {
  const [stories, setStories] = useState<StoryRow[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/stories');
        if (res.ok) {
          const data = await res.json();
          setStories((data.stories || []).filter((s: StoryRow) => s.mode === 'single' && s.status === 'success'));
        }
      } catch (e) {
        console.error('Failed to load stories', e);
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
        {stories.length === 0 && (
          <p className="text-sm text-muted-foreground col-span-full">
            No episodes yet. Generate a single-episode story in Story Generate, then start production from there.
          </p>
        )}
        {stories.map((story) => (
          <Link
            key={story.id}
            href={`/episode-production/${story.id}`}
            className="flex flex-col p-5 rounded-2xl border border-border bg-card min-h-[160px]"
          >
            <span className="inline-flex items-center gap-1.5 self-start px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-primary/10 text-primary mb-3">
              {STAGE_LABELS[story.production_stage] || story.production_stage}
            </span>
            <h3 className="text-lg font-bold text-foreground line-clamp-2">{story.topic || 'Untitled Story'}</h3>
            <p className="text-sm text-muted-foreground mt-auto pt-4">
              {new Date(story.generated_at).toLocaleDateString()}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
