'use client';

import { useState } from 'react';
import { Users, MapPin, Check, Loader2, User, ExternalLink } from 'lucide-react';
import { labelClass, primaryButtonClass } from '@/lib/styles';
import type { EpisodeLocationRow, CharacterRow } from './types';

interface ReferencesStageProps {
  episodeLocations: EpisodeLocationRow[];
  characters: CharacterRow[];
  onConfirmed: () => Promise<void> | void;
}

export function ReferencesStage({
  episodeLocations,
  characters,
  onConfirmed,
}: ReferencesStageProps) {
  const [isConfirming, setIsConfirming] = useState(false);

  const handleConfirm = async () => {
    setIsConfirming(true);
    try {
      await onConfirmed();
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* SECTION 1: Episode Characters */}
      <div className="space-y-3">
        <label className={labelClass}>
          <Users className="w-4 h-4 text-primary" />
          Episode Characters ({characters.length})
        </label>
        {characters.length === 0 ? (
          <p className="text-sm text-muted-foreground p-4 rounded-xl border border-border bg-card">
            No character profiles linked to this episode yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {characters.map((char) => {
              const hasImage = Boolean(char.reference_image_url);
              return (
                <div
                  key={char.id}
                  onClick={() => {
                    if (hasImage && char.reference_image_url) {
                      window.open(char.reference_image_url, '_blank', 'noopener,noreferrer');
                    }
                  }}
                  className={`group p-4 rounded-xl border border-border bg-card flex items-start gap-3 transition-all ${
                    hasImage
                      ? 'cursor-pointer hover:border-primary/60 hover:bg-card/80 hover:scale-[1.01]'
                      : ''
                  }`}
                  title={hasImage ? `Click to view ${char.name} reference image` : undefined}
                >
                  {hasImage && char.reference_image_url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={char.reference_image_url}
                      alt={char.name}
                      className="w-12 h-12 rounded-full object-cover border border-primary/30 shrink-0 group-hover:border-primary transition-colors"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                      <User className="w-6 h-6" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-base text-foreground truncate flex items-center justify-between gap-1">
                      <span className="truncate">{char.name}</span>
                      {hasImage && (
                        <ExternalLink className="w-3.5 h-3.5 text-muted-foreground opacity-60 group-hover:opacity-100 group-hover:text-primary shrink-0 transition-opacity" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {char.description || 'No description provided.'}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SECTION 2: Episode Locations */}
      <div className="space-y-3">
        <label className={labelClass}>
          <MapPin className="w-4 h-4 text-emerald-500" />
          Episode Locations ({episodeLocations.length})
        </label>
        {episodeLocations.length === 0 ? (
          <p className="text-sm text-muted-foreground p-4 rounded-xl border border-border bg-card">
            No locations confirmed for this episode yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {episodeLocations.map((el) => {
              const loc = el.Location;
              const imgUrl = el.stylesheet_image_url || loc.generated_image_url || loc.reference_image_url;
              const hasImage = Boolean(imgUrl);

              return (
                <div
                  key={el.id}
                  onClick={() => {
                    if (hasImage && imgUrl) {
                      window.open(imgUrl, '_blank', 'noopener,noreferrer');
                    }
                  }}
                  className={`group p-4 rounded-xl border border-border bg-card flex items-start gap-3 transition-all ${
                    hasImage
                      ? 'cursor-pointer hover:border-emerald-500/60 hover:bg-card/80 hover:scale-[1.01]'
                      : ''
                  }`}
                  title={hasImage ? `Click to view ${loc.name} image` : undefined}
                >
                  {hasImage && imgUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={imgUrl}
                      alt={loc.name}
                      className="w-12 h-12 rounded-lg object-cover border border-emerald-500/30 shrink-0 group-hover:border-emerald-500 transition-colors"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-bold text-sm shrink-0">
                      <MapPin className="w-6 h-6" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-base text-foreground truncate flex items-center justify-between gap-1">
                      <span className="truncate">{loc.name}</span>
                      {hasImage && (
                        <ExternalLink className="w-3.5 h-3.5 text-muted-foreground opacity-60 group-hover:opacity-100 group-hover:text-emerald-500 shrink-0 transition-opacity" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {loc.description || 'No location description provided.'}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* CONFIRM BUTTON */}
      <div className="pt-4 border-t border-border/60 flex justify-end">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={isConfirming}
          className={primaryButtonClass}
        >
          {isConfirming ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Check className="w-4 h-4" />
          )}
          Confirm References
        </button>
      </div>
    </div>
  );
}
