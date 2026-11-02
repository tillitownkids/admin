import { redirect } from "next/navigation";

// The Video step became part of Sequences; stitching moved to Publish.
export default async function EpisodeVideoPage({ params }: { params: Promise<{ storyId: string }> }) {
  const { storyId } = await params;
  redirect(`/episodes/${storyId}/sequences?tab=clips`);
}
