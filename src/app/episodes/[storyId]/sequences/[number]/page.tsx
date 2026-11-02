import { notFound } from "next/navigation";

import { SequenceWorkspace } from "@/components/sequence/SequenceWorkspace";

// Planning a clip runs an AI call from this page's server actions, which can take minutes.
export const maxDuration = 300;

/** One sequence's page, addressed by its number: /episodes/<id>/sequences/18. */
export default async function SequencePage({ params }: { params: Promise<{ storyId: string; number: string }> }) {
  const { storyId, number } = await params;
  const sequenceNumber = Number(number);
  if (!Number.isSafeInteger(sequenceNumber) || sequenceNumber < 1) notFound();
  return <SequenceWorkspace key={sequenceNumber} storyId={storyId} number={sequenceNumber} />;
}
