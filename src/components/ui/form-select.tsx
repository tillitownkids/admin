"use client";

import { Children, isValidElement, type ReactNode } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface OptionProps {
  value: string;
  children: ReactNode;
  disabled?: boolean;
}

interface FormSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
  ariaLabel: string;
  className?: string;
  id?: string;
  name?: string;
  disabled?: boolean;
}

/** Reuses option definitions while rendering the app's scrollable select. */
export function FormSelect({ value, onValueChange, children, ariaLabel, className, id, name, disabled }: FormSelectProps) {
  const options = Children.toArray(children).flatMap((child) =>
    isValidElement<OptionProps>(child) && child.type === "option"
      ? [{ value: child.props.value, label: child.props.children, disabled: child.props.disabled }]
      : [],
  );

  return (
    <Select value={value} onValueChange={(nextValue) => onValueChange(nextValue ?? "")} items={options} name={name} disabled={disabled}>
      <SelectTrigger id={id} aria-label={ariaLabel} className={cn("w-full min-w-0 rounded-lg bg-background/60 px-4 py-3 text-base data-[size=default]:h-auto", className)}>
        <SelectValue className="min-w-0 truncate" placeholder="Select an option" />
      </SelectTrigger>
      <SelectContent align="start" alignItemWithTrigger={false} className="rounded-xl p-1" style={{ maxHeight: "min(20rem, var(--available-height))" }}>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value} disabled={option.disabled} className="py-2.5 data-highlighted:bg-accent data-highlighted:text-accent-foreground [&>span:first-child]:min-w-0 [&>span:first-child]:shrink [&>span:first-child]:whitespace-normal">
            <span className="min-w-0 break-words">{option.label}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
