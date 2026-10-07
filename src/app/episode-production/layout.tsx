import { ProductionNavigation } from "@/components/episode-production/ProductionNavigation";
import { PageHeader } from "@/components/PageHeader";
import { Clapperboard } from "lucide-react";

export default function VideoProductionLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-6">
      <PageHeader
        icon={Clapperboard}
        title="Video"
        highlight="Production"
        description="Your complete creation workflow, from the first story idea to a production-ready episode."
      />
      <ProductionNavigation />
      {children}
    </div>
  );
}
