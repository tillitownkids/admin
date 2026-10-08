import { redirect } from "next/navigation";

import { supabase } from "@/lib/supabase";

// Old address for a storyboard, which was opened by either its story id or its script id.
export default async function LegacyStoryboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: story } = await supabase.from("Story").select("id").eq("id", id).maybeSingle();
  if (story) redirect(`/episodes/${story.id}/storyboard`);
  const { data: script } = await supabase.from("Script").select("story_id").eq("id", id).maybeSingle();
  redirect(script?.story_id ? `/episodes/${script.story_id}/storyboard` : "/episodes");
}
