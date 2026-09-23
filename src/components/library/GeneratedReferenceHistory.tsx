'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, History, Image as ImageIcon, Loader2, RotateCcw, Trash2 } from 'lucide-react';
import type { GeneratedImageOwnerType } from '@/lib/generatedImageHistory';

interface GeneratedImageAsset {
  id: string;
  public_url: string;
  provider_identifier: string | null;
  is_selected: boolean;
  created_at: string;
}

interface GeneratedReferenceHistoryProps {
  ownerType: GeneratedImageOwnerType;
  ownerId: string;
  resourceName: string;
  disabled?: boolean;
  onRestored: (asset: GeneratedImageAsset) => void | Promise<void>;
}

function formatGeneratedAt(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function GeneratedReferenceHistory({
  ownerType,
  ownerId,
  resourceName,
  disabled = false,
  onRestored,
}: GeneratedReferenceHistoryProps) {
  const [assets, setAssets] = useState<GeneratedImageAsset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeAssetId, setActiveAssetId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ ownerType, ownerId });
      const res = await fetch(`/api/generated-image-history?${query.toString()}`, { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to load generation history.');
      setAssets(data.assets || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load generation history.');
    } finally {
      setIsLoading(false);
    }
  }, [ownerId, ownerType]);

  useEffect(() => {
    let cancelled = false;
    const query = new URLSearchParams({ ownerType, ownerId });

    fetch(`/api/generated-image-history?${query.toString()}`, { cache: 'no-store' })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Failed to load generation history.');
        if (!cancelled) setAssets(data.assets || []);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load generation history.');
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [ownerId, ownerType]);

  const handleRestore = async (asset: GeneratedImageAsset) => {
    if (!confirm(`Restore this historical ${resourceName.toLowerCase()} reference sheet?`)) return;

    setActiveAssetId(asset.id);
    setError(null);
    try {
      const res = await fetch(`/api/generated-image-history/${asset.id}`, { method: 'PATCH' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to restore image.');
      await onRestored(data.asset);
      await loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restore image.');
    } finally {
      setActiveAssetId(null);
    }
  };

  const handleDelete = async (asset: GeneratedImageAsset) => {
    if (!confirm('Delete this historical image? This action cannot be undone.')) return;

    setActiveAssetId(asset.id);
    setError(null);
    try {
      const res = await fetch(`/api/generated-image-history/${asset.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to delete image.');
      setAssets((current) => current.filter((item) => item.id !== asset.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete image.');
    } finally {
      setActiveAssetId(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <History className="w-4 h-4 text-primary" />
          Generation History
        </div>
        {!isLoading && assets.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {assets.length} version{assets.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 p-2.5 text-xs text-destructive">
          {error}
        </p>
      )}

      {isLoading ? (
        <div className="min-h-40 rounded-xl border border-border bg-muted/20 flex items-center justify-center">
          <Loader2 className="w-5 h-5 text-primary animate-spin" />
        </div>
      ) : assets.length === 0 ? (
        <div className="min-h-40 rounded-xl border border-dashed border-border bg-muted/20 flex flex-col items-center justify-center gap-2 p-5 text-center text-muted-foreground">
          <ImageIcon className="w-7 h-7 opacity-50" />
          <p className="text-xs">No saved versions yet. The next saved generation will appear here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 max-h-[360px] overflow-y-auto pr-1">
          {assets.map((asset) => {
            const isBusy = activeAssetId === asset.id;
            return (
              <article
                key={asset.id}
                className={`overflow-hidden rounded-xl border bg-card ${
                  asset.is_selected ? 'border-primary/60 ring-1 ring-primary/20' : 'border-border'
                }`}
              >
                <a href={asset.public_url} target="_blank" rel="noopener noreferrer" className="block aspect-video bg-muted overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={asset.public_url}
                    alt={`Generated ${resourceName} version`}
                    className="w-full h-full object-cover hover:scale-105 transition-transform duration-200"
                  />
                </a>
                <div className="p-2.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <time className="text-[10px] leading-tight text-muted-foreground" dateTime={asset.created_at}>
                      {formatGeneratedAt(asset.created_at)}
                    </time>
                    {asset.is_selected && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                        <Check className="w-3 h-3" /> Current
                      </span>
                    )}
                  </div>

                  {!asset.is_selected && (
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => void handleRestore(asset)}
                        disabled={disabled || activeAssetId !== null}
                        className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg bg-primary/10 px-2 py-1.5 text-[11px] font-semibold text-primary hover:bg-primary/20 disabled:opacity-50"
                      >
                        {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                        Restore
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(asset)}
                        disabled={disabled || activeAssetId !== null}
                        aria-label="Delete historical image"
                        title="Delete historical image"
                        className="inline-flex items-center justify-center rounded-lg bg-destructive/10 p-1.5 text-destructive hover:bg-destructive/20 disabled:opacity-50"
                      >
                        {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
