"use client";

import { useId } from "react";
import { Check, Loader2, Trash2 } from "lucide-react";

import { ConfirmButton } from "@/components/ConfirmButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface Take {
  /** Stable identity within one picker. */
  key: string;
  url: string;
  createdAt?: string | null;
  inUse: boolean;
  /** False for a take that cannot be removed, such as one saved before takes were recorded. */
  deletable?: boolean;
}

function formatTakeTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

/**
 * Every take generated for one thing (a reference sheet, a storyboard image, a clip), side by side.
 * One is in use; any other can be put in use or deleted. Takes are numbered oldest first.
 */
export function TakePicker({
  kind,
  subject,
  takes,
  busyKey,
  disabled = false,
  onUse,
  onDelete,
  className,
}: {
  kind: "image" | "video";
  /** What the takes are of, for labels: "storyboard image", "clip", "reference sheet". */
  subject: string;
  takes: Take[];
  /** The take an action is running on. */
  busyKey?: string | null;
  disabled?: boolean;
  onUse: (take: Take) => void;
  onDelete?: (take: Take) => void;
  className?: string;
}) {
  return (
    <ul className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3", className)}>
      {takes.map((take, index) => {
        const number = index + 1;
        const time = take.createdAt ? formatTakeTime(take.createdAt) : null;
        const busy = busyKey === take.key;
        return (
          <li
            key={take.key}
            className={cn(
              "overflow-hidden rounded-lg border bg-card",
              take.inUse ? "border-primary ring-2 ring-primary/25" : "border-border"
            )}
          >
            {kind === "image" ? (
              <a href={take.url} target="_blank" rel="noopener noreferrer" title="Open the full image in a new tab" className="block bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={take.url} alt={`Take ${number} of the ${subject}`} loading="lazy" className="aspect-video w-full object-cover" />
              </a>
            ) : (
              <video controls preload="metadata" src={take.url} aria-label={`Take ${number} of the ${subject}`} className="aspect-video w-full bg-black object-contain" />
            )}
            <div className="flex min-h-12 flex-wrap items-center justify-between gap-x-2 gap-y-1.5 px-2.5 py-2">
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Take {number}</span>
                {time && <time dateTime={take.createdAt!}> · {time}</time>}
              </p>
              {take.inUse ? (
                <Badge>
                  <Check />
                  In use
                </Badge>
              ) : (
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="outline" disabled={disabled || Boolean(busyKey)} onClick={() => onUse(take)}>
                    {busy && <Loader2 className="animate-spin" />}
                    Use this take
                  </Button>
                  {onDelete && take.deletable !== false && (
                    <ConfirmButton
                      size="icon-sm"
                      variant="ghost"
                      destructive
                      disabled={disabled || Boolean(busyKey)}
                      aria-label={`Delete take ${number}`}
                      title={`Delete take ${number} of the ${subject}?`}
                      description="The take and its stored file are removed for good. The take in use is not affected."
                      confirmLabel="Delete take"
                      onConfirm={() => onDelete(take)}
                    >
                      <Trash2 />
                    </ConfirmButton>
                  )}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

const TAKE_COUNTS = [1, 2, 3, 4].map((count) => ({ value: String(count), label: count === 1 ? "1 take" : `${count} takes` }));

/** How many takes each generation produces. More takes cost proportionally more credits. */
export function TakeCountSelect({
  value,
  onChange,
  disabled = false,
}: {
  value: number;
  onChange: (count: number) => void;
  disabled?: boolean;
}) {
  const labelId = useId();
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <span id={labelId}>Each generation makes</span>
      <Select value={String(value)} onValueChange={(next) => onChange(Number(next) || 1)} items={TAKE_COUNTS} disabled={disabled}>
        <SelectTrigger size="sm" aria-labelledby={labelId}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="start" alignItemWithTrigger={false}>
          {TAKE_COUNTS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
