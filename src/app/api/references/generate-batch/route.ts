import { NextResponse } from 'next/server';
import { generateReference, type ReferenceType } from '@/lib/referenceGeneration';

interface BatchItem {
  id: string;
  type: ReferenceType;
}

interface BatchFailure extends BatchItem {
  error: string;
}

function uniqueIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((id): id is string => typeof id === 'string' && Boolean(id.trim()))));
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = { status: 'fulfilled', value: await worker(items[index]) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runWorker));
  return results;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const characterIds = uniqueIds(body.characterIds);
    const locationIds = uniqueIds(body.locationIds);
    const items: BatchItem[] = [
      ...characterIds.map((id) => ({ id, type: 'character' as const })),
      ...locationIds.map((id) => ({ id, type: 'location' as const })),
    ];

    if (items.length > 50) {
      return NextResponse.json({ error: 'A maximum of 50 references can be generated at once.' }, { status: 400 });
    }
    if (items.length === 0) {
      return NextResponse.json({ successful: [], failed: [] });
    }

    const settled = await runWithConcurrency(items, 3, (item) => generateReference(item.type, item.id));
    const successful = settled.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
    const failed: BatchFailure[] = settled.flatMap((result, index) => {
      if (result.status === 'fulfilled') return [];
      const reason = result.reason;
      return [{
        ...items[index],
        error: reason instanceof Error ? reason.message : 'Reference generation failed.',
      }];
    });

    return NextResponse.json({ successful, failed }, { status: failed.length > 0 ? 422 : 200 });
  } catch (error) {
    console.error('Failed to generate reference batch:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Reference generation failed.' },
      { status: 500 },
    );
  }
}
