import { StoryEditor } from "@/components/episode/StoryEditor";

export default async function EpisodeStoryPage({ params }: { params: Promise<{ storyId: string }> }) {
  const { storyId } = await params;
  return <StoryEditor storyId={storyId} />;
}
