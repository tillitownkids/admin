import { redirect } from 'next/navigation';

export default async function LegacyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/episode-production/storyboards/${encodeURIComponent(id)}`);
}
