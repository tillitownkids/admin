/** What a step shows before it has any work in it: what happens next, and the one action that starts it. */
export function StepStart({
  title,
  description,
  action,
  note,
}: {
  title: string;
  description: React.ReactNode;
  action?: React.ReactNode;
  note?: React.ReactNode;
}) {
  return (
    <div className="max-w-xl space-y-4 py-6">
      <div className="space-y-1.5">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}
