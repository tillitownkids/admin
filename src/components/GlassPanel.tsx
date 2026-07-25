import { cn } from "@/lib/utils";

interface GlassPanelProps {
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

export function GlassPanel({ children, footer, className }: GlassPanelProps) {
  return (
    <div
      className={cn(
        "bg-card border border-border rounded-2xl overflow-hidden",
        className
      )}
    >
      <div className="p-6 sm:p-8 space-y-6">
        {children}
      </div>
      {footer && (
        <div className="bg-muted/30 p-5 sm:px-8 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4">
          {footer}
        </div>
      )}
    </div>
  );
}
