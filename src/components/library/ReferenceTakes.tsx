'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';

import { TakePicker, type Take } from '@/components/TakePicker';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import type { GeneratedImageOwnerType, GeneratedImageTake } from '@/lib/generatedImageHistory';
import { queryKeys } from '@/lib/queryKeys';

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
  const queryClient = useQueryClient();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Cached: reopening a character, location or object shows its takes at once.
  const takesKey = queryKeys.imageTakes(ownerType, ownerId);
  const takesQuery = useQuery({
    queryKey: takesKey,
    queryFn: async (): Promise<GeneratedImageTake[]> => {
      const query = new URLSearchParams({ ownerType, ownerId });
      const res = await fetch(`/api/generated-image-history?${query.toString()}`, { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `The takes could not be loaded (HTTP ${res.status}).`);
      return data.assets || [];
    },
  });
  const assets = takesQuery.data ?? (takesQuery.isError ? [] : null);
  const error = actionError ?? (takesQuery.error ? takesQuery.error.message : null);
  const setError = setActionError;
  const load = () => queryClient.invalidateQueries({ queryKey: takesKey });

  // A new take was generated: load the takes again.
  const lastReloadKey = useRef(reloadKey);
  useEffect(() => {
    if (lastReloadKey.current === reloadKey) return;
    lastReloadKey.current = reloadKey;
    void queryClient.invalidateQueries({ queryKey: queryKeys.imageTakes(ownerType, ownerId) });
  }, [queryClient, reloadKey, ownerType, ownerId]);

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
