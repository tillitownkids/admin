import type { LucideIcon } from "lucide-react";

interface PageHeaderProps {
  icon?: LucideIcon;
  title: string;
  highlight?: string;
  description: React.ReactNode;
  action?: React.ReactNode;
}

export function PageHeader({ icon: Icon, title, highlight, description, action }: PageHeaderProps) {
  return (
    <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        {Icon && (
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 text-primary border border-primary/20 shrink-0">
            <Icon className="w-5 h-5" />
          </div>
        )}
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground font-heading">
            {title}{" "}
            {highlight && (
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary/60">
                {highlight}
              </span>
            )}
          </h1>
          <div className="text-muted-foreground mt-1">{description}</div>
        </div>
      </div>
      {action}
    </header>
  );
}
