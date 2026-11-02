import { redirect } from "next/navigation";

// The Storyboard step became part of Sequences.
export default async function EpisodeStoryboardPage({ params }: { params: Promise<{ storyId: string }> }) {
  const { storyId } = await params;
  redirect(`/episodes/${storyId}/sequences?tab=storyboards`);
}
