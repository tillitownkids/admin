import { CreditsSection } from "@/components/CreditsSection";
import { DashboardSettings } from "@/components/DashboardSettings";
import { PageHeader } from "@/components/PageHeader";
import { YouTubeConnectionPanel } from "@/components/youtube/YouTubeConnectionPanel";
import { supabase } from "@/lib/supabase";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ youtube?: string }> }) {
  const [{ data: connection }, query] = await Promise.all([
    supabase.from("YouTubeConnection").select("channel_id,channel_title").eq("id", "primary").maybeSingle(),
    searchParams,
  ]);

  return (
    <div className="mx-auto w-full max-w-[900px] space-y-8 pb-10">
      <PageHeader title="Settings" description="Defaults for new stories, generation credits, and the YouTube channel episodes publish to." />
      <DashboardSettings />
      <CreditsSection />
      <YouTubeConnectionPanel
        connection={connection ? { channelId: connection.channel_id, channelTitle: connection.channel_title } : null}
        callbackStatus={query.youtube}
      />
    </div>
  );
}
