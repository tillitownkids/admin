'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

import { TakePicker, type Take } from '@/components/TakePicker';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import type { GeneratedImageOwnerType, GeneratedImageTake } from '@/lib/generatedImageHistory';

/** Every reference sheet generated for one character or location, with the one in use marked. */
export function ReferenceTakes({
  ownerType,
  ownerId,
  resourceName,
  reloadKey,
  disabled = false,
  onChosen,
}: {
  ownerType: GeneratedImageOwnerType;
  ownerId: string;
  resourceName: string;
  /** Change it to load the takes again, after a new one is generated. */
  reloadKey: number;
  disabled?: boolean;
  onChosen: (asset: GeneratedImageTake) => void;
}) {
  const [assets, setAssets] = useState<GeneratedImageTake[] | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const query = new URLSearchParams({ ownerType, ownerId });
      const res = await fetch(`/api/generated-image-history?${query.toString()}`, { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `The takes could not be loaded (HTTP ${res.status}).`);
      setAssets(data.assets || []);
      setError(null);
    } catch (err) {
      setAssets((current) => current ?? []);
      setError(err instanceof Error ? err.message : 'The takes could not be loaded.');
    }
  }, [ownerId, ownerType]);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load, reloadKey]);

  const act = async (take: Take, method: 'PATCH' | 'DELETE') => {
    setBusyKey(take.key);
    setError(null);
    try {
      const res = await fetch(`/api/generated-image-history/${take.key}`, { method });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `That did not work (HTTP ${res.status}).`);
      if (method === 'PATCH' && data.asset) onChosen(data.asset);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work.');
    } finally {
      setBusyKey(null);
    }
  };

  if (assets === null) return <Skeleton className="aspect-video w-full max-w-sm" />;

  const subject = `${resourceName.toLowerCase()} reference sheet`;
  const takes: Take[] = assets.map((asset) => ({
    key: asset.id ?? `current-${asset.owner_id}`,
    url: asset.public_url,
    createdAt: asset.created_at,
    inUse: asset.is_selected,
    deletable: asset.id !== null,
  }));

  return (
    <div className="space-y-3">
      {error && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {takes.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No reference sheet yet. Every sheet you generate is kept here, so you can compare them and choose one.
        </p>
      ) : (
        <TakePicker
          kind="image"
          subject={subject}
          takes={takes}
          busyKey={busyKey}
          disabled={disabled}
          onUse={(take) => act(take, 'PATCH')}
          onDelete={(take) => act(take, 'DELETE')}
        />
      )}
    </div>
  );
}
