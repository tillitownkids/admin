"use client";

import { useState } from "react";
import { Tv, Mail, Lock, Eye, EyeOff, AlertCircle, Loader2, ShieldCheck } from "lucide-react";
import { login } from "@/actions/auth";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    const formData = new FormData(event.currentTarget);
    try {
      const res = await login(formData);
      if (res && res.error) {
        setErrorMessage(res.error);
      }
    } catch (err: unknown) {
      // Next.js redirect throws a redirect error which should be allowed to bubble
      if (err && typeof err === 'object' && 'digest' in err && typeof (err as { digest?: unknown }).digest === 'string' && (err as { digest: string }).digest.startsWith('NEXT_REDIRECT')) {
        throw err;
      }
      setErrorMessage("An unexpected error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center bg-background text-foreground p-4 overflow-hidden">

      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-96 bg-primary/10 blur-[120px] pointer-events-none rounded-full" />

 
      <div className="absolute top-6 right-6 z-10">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md z-10 page-enter">
        <div className="bg-card text-card-foreground border border-border shadow-2xl rounded-2xl p-8 space-y-6">
          
          <div className="flex flex-col items-center text-center space-y-3">
            <div className="flex items-center justify-center w-14 h-14 bg-primary text-primary-foreground rounded-2xl shadow-lg shadow-primary/25">
              <Tv size={30} strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                TilliTown Admin
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Enter your credentials to access the portal
              </p>
            </div>
          </div>

          {errorMessage && (
            <div className="flex items-start gap-3 p-3.5 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-xl animate-in fade-in slide-in-from-top-1">
              <AlertCircle size={18} className="shrink-0 mt-0.5" />
              <div className="flex-1 font-medium">{errorMessage}</div>
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-xs font-semibold text-foreground uppercase tracking-wider">
                Email Address
              </label>
              <div className="relative">
                <Mail size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="admin@tillitown.com"
                  className="w-full pl-10 pr-4 py-2.5 bg-muted/30 border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="text-xs font-semibold text-foreground uppercase tracking-wider">
                Password
              </label>
              <div className="relative">
                <Lock size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-2.5 bg-muted/30 border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-11 text-sm font-semibold shadow-md bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl transition-colors mt-2"
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="animate-spin" size={18} />
                  Authenticating...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <ShieldCheck size={18} />
                  Sign In
                </span>
              )}
            </Button>
          </form>

        </div>
      </div>
    </div>
  );
}
