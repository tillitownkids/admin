import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { StoryGenerator } from "@/components/episode/StoryGenerator";
import { PageHeader } from "@/components/PageHeader";

export default function NewEpisodePage() {
  return (
    <div className="mx-auto w-full max-w-[900px] space-y-6 pb-10">
      <div className="space-y-2">
        <Link
          href="/episodes"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          <ArrowLeft className="size-3.5" />
          Episodes
        </Link>
        <PageHeader
          title="New episode"
          description="An episode starts as a story. Describe it, and the story is written for you to edit before anything else is generated."
        />
      </div>
      <StoryGenerator />
    </div>
  );
}
