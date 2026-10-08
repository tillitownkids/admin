// Shared class strings for screens that still use plain elements. They resolve to the same
// look as the ui/ components, so a <button className={primaryButtonClass}> and a <Button> match.

import { buttonVariants } from "@/components/ui/button";

export const fieldClass =
  "w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30";

export const selectFieldClass = `${fieldClass} appearance-none cursor-pointer pr-9`;

export const labelClass = "flex items-center gap-2 text-sm font-medium text-foreground";

export const primaryButtonClass = buttonVariants({ variant: "default" });

export const secondaryButtonClass = buttonVariants({ variant: "outline" });
