import { redirect } from "next/navigation";

import { supabase } from "@/lib/supabase";

// Old address for a script. Scripts now open inside their episode.
export default async function LegacyScriptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data } = await supabase.from("Script").select("story_id").eq("id", id).maybeSingle();
  redirect(data?.story_id ? `/episodes/${data.story_id}/script` : "/episodes");
}
