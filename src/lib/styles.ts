// Shared class strings so every page's form fields, buttons, and labels render identically.

export const fieldClass =
  "w-full bg-background/60 border border-input rounded-lg px-4 py-3 text-base transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary placeholder:text-muted-foreground/60 hover:bg-background text-foreground";

export const selectFieldClass = `${fieldClass} appearance-none cursor-pointer`;

export const labelClass =
  "text-sm font-bold tracking-wider uppercase text-foreground/80 flex items-center gap-2";

export const primaryButtonClass =
  "flex items-center justify-center gap-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold transition-all duration-300 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed px-5 py-2.5";

export const secondaryButtonClass =
  "flex items-center justify-center gap-2 rounded-lg border border-border/80 bg-background/80 hover:bg-muted text-foreground font-semibold transition-all duration-300 active:scale-[0.98] px-5 py-2.5";
