'use client';

import { useState, useEffect } from "react";
import { Coins, RotateCw, AlertCircle } from "lucide-react";

interface CreditsData {
  available: number;
  totalPlan: number;
  spent: number;
  hasExtraCredits: boolean;
}

interface PlanData {
  tier?: string;
  productName?: string;
  isUnlimitedMode?: boolean;
  unlimitedAppliesHere?: boolean;
}

export function CreditsSection() {
  const [data, setData] = useState<CreditsData | null>(null);
  const [plan, setPlan] = useState<PlanData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefetching, setIsRefetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchCredits(showRefetchState = false) {
    if (showRefetchState) setIsRefetching(true);
    else setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("https://n8n.roastnest.com/webhook/get-credits", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });

      if (!res.ok) {
        throw new Error(`Failed to fetch credits (Status ${res.status})`);
      }

      const json = await res.json();
      if (json) {
        if (json.credits) setData(json.credits);
        if (json.Plan) setPlan(json.Plan);
      } else {
        throw new Error("Invalid credits data format received");
      }
    } catch (err: any) {
      console.error("Error fetching credits:", err);
      setError(err?.message || "Failed to load credits");
    } finally {
      setIsLoading(false);
      setIsRefetching(false);
    }
  }

  useEffect(() => {
    fetchCredits();
  }, []);

  // Calculate percentages safely
  const total = data?.totalPlan || 1;
  const available = data?.available || 0;
  const spent = data?.spent || 0;
  const availablePercent = Math.min(100, Math.max(0, Math.round((available / total) * 100)));
  const spentPercent = Math.min(100, Math.max(0, Math.round((spent / total) * 100)));

  return (
    <div className="bg-card text-card-foreground rounded-xl border border-border flex flex-col shadow-sm">
      {/* Header */}
      <div className="p-5 border-b border-border flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-primary/10 text-primary">
            <Coins size={20} strokeWidth={2} />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-foreground flex items-center gap-2">
              Credits & Plan Usage
            </h2>
            <p className="text-xs text-muted-foreground">
              Monitor your AI credits allocation, balance, and plan tier
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {plan?.productName && (
            <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-primary/10 text-primary border border-primary/20">
              {plan.productName} Plan
            </span>
          )}

          <button
            onClick={() => fetchCredits(true)}
            disabled={isLoading || isRefetching}
            className="p-2 rounded-lg bg-secondary text-secondary-foreground hover:bg-muted transition-colors disabled:opacity-50 cursor-pointer"
            title="Refresh Credits"
          >
            <RotateCw size={14} className={isRefetching || isLoading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Body Content */}
      <div className="p-5 space-y-5">
        {isLoading && !data ? (
          <div className="space-y-4 py-2 animate-pulse">
            <div className="h-4 bg-muted rounded-full w-full" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="h-20 bg-muted/60 rounded-xl" />
              <div className="h-20 bg-muted/60 rounded-xl" />
              <div className="h-20 bg-muted/60 rounded-xl" />
            </div>
          </div>
        ) : error && !data ? (
          <div className="p-4 bg-destructive/10 text-destructive border border-destructive/20 rounded-xl text-xs font-medium flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
            <button
              onClick={() => fetchCredits()}
              className="px-3 py-1 bg-destructive text-destructive-foreground rounded-lg hover:opacity-90 transition-opacity"
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            {/* Visual Usage Progress Bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-medium">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  Available: <strong className="text-foreground">{availablePercent}%</strong>
                </span>
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  Spent: <strong className="text-foreground">{spentPercent}%</strong>
                </span>
              </div>
              <div className="h-3 w-full bg-muted/60 rounded-full overflow-hidden flex p-0.5 border border-border/40">
                <div
                  style={{ width: `${availablePercent}%` }}
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500 shadow-sm"
                />
                <div
                  style={{ width: `${spentPercent}%` }}
                  className="h-full bg-amber-500/80 rounded-full transition-all duration-500 ml-0.5"
                />
              </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Available Credits Card */}
              <div className="bg-muted/30 p-4 rounded-xl border border-border/60 flex flex-col justify-between">
                <div className="text-xs font-medium text-muted-foreground mb-2">
                  Available Balance
                </div>
                <div className="text-2xl font-bold tracking-tight text-emerald-500">
                  {available.toLocaleString()}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  Ready for generation tasks
                </div>
              </div>

              {/* Spent Credits Card */}
              <div className="bg-muted/30 p-4 rounded-xl border border-border/60 flex flex-col justify-between">
                <div className="text-xs font-medium text-muted-foreground mb-2">
                  Credits Spent
                </div>
                <div className="text-2xl font-bold tracking-tight text-foreground">
                  {spent.toLocaleString()}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  Used in current plan period
                </div>
              </div>

              {/* Total Plan Card */}
              <div className="bg-muted/30 p-4 rounded-xl border border-border/60 flex flex-col justify-between">
                <div className="text-xs font-medium text-muted-foreground mb-2">
                  Total Plan Limit
                </div>
                <div className="text-2xl font-bold tracking-tight text-foreground">
                  {total.toLocaleString()}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  {plan?.productName ? `${plan.productName} Plan` : 'Base allocation'}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
