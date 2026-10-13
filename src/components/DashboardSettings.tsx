'use client';

import { Save, Check, Loader2, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { labelClass, selectFieldClass, primaryButtonClass } from "@/lib/styles";
import { getGlobalSettingsAction, saveGlobalSettingsAction } from "@/actions/settingsAction";

interface SettingsState {
  targetAudience: string;
  tone: string;
  aiModel: string;
}

export function DashboardSettings() {
  const [savedState, setSavedState] = useState<SettingsState>({
    targetAudience: 'kids',
    tone: 'educational',
    aiModel: 'claude',
  });

  const [currentState, setCurrentState] = useState<SettingsState>({
    targetAudience: 'kids',
    tone: 'educational',
    aiModel: 'claude',
  });

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cached: reopening Settings shows the saved values at once.
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: queryKeys.settings(),
    queryFn: async (): Promise<SettingsState> => {
      const res = await getGlobalSettingsAction();
      // Without this, a failed load would show the defaults as if they were saved.
      if (!res.success) throw new Error(res.error || "The settings could not be loaded.");
      return {
        targetAudience: res.settings?.targetAudience || 'kids',
        tone: res.settings?.tone || 'educational',
        aiModel: res.settings?.aiModel || 'claude',
      };
    },
  });
  const isLoading = settingsQuery.isPending;
  const loadError = settingsQuery.error ? settingsQuery.error.message : null;

  // Loaded values fill the form; a newer load replaces them only while nothing was changed.
  const [seededFrom, setSeededFrom] = useState<SettingsState | undefined>(undefined);
  const unchanged =
    currentState.targetAudience === savedState.targetAudience &&
    currentState.tone === savedState.tone &&
    currentState.aiModel === savedState.aiModel;
  if (settingsQuery.data && settingsQuery.data !== seededFrom && unchanged) {
    setSeededFrom(settingsQuery.data);
    setSavedState(settingsQuery.data);
    setCurrentState(settingsQuery.data);
  }

  const isDirty =
    currentState.targetAudience !== savedState.targetAudience ||
    currentState.tone !== savedState.tone ||
    currentState.aiModel !== savedState.aiModel;

  const handleAudienceChange = (val: string) => {
    setCurrentState((prev) => ({ ...prev, targetAudience: val }));
  };

  const handleToneChange = (val: string) => {
    setCurrentState((prev) => ({ ...prev, tone: val }));
  };

  const handleModelChange = (val: string) => {
    setCurrentState((prev) => ({ ...prev, aiModel: val }));
  };

  const handleSaveChanges = async () => {
    setIsSaving(true);
    setError(null);
    try {
      const res = await saveGlobalSettingsAction({
        targetAudience: currentState.targetAudience,
        tone: currentState.tone,
        aiModel: currentState.aiModel,
      });

      console.log('[GLOBAL STORY SETTINGS SAVED TO DATABASE]', res);

      if (res.success) {
        setSavedState(currentState);
        queryClient.setQueryData(queryKeys.settings(), currentState);
        setSaveSuccess(true);
        // Sync localStorage for fallback
        localStorage.setItem('targetAudience', currentState.targetAudience);
        localStorage.setItem('tone', currentState.tone);
        localStorage.setItem('aiModel', currentState.aiModel);
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        setError(res.error || "The settings could not be saved.");
      }
    } catch (err) {
      console.error("Failed to save global settings to DB:", err);
      setError("The settings could not be saved. Try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-card text-card-foreground rounded-xl border border-border flex flex-col h-fit overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold">Story defaults</h2>
        </div>

        {/* Save Changes button appears ONLY when inputs are modified */}
        {!isDirty && saveSuccess && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Check size={14} />
            Saved
          </span>
        )}
        {isDirty && (
          <button
            onClick={handleSaveChanges}
            disabled={isSaving}
            className={`${primaryButtonClass} bg-primary hover:bg-primary/90 text-primary-foreground text-xs px-4 py-2 rounded-lg flex items-center gap-2 transition-all shadow-md animate-in fade-in cursor-pointer disabled:opacity-50`}
          >
            {isSaving ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Saving...
              </>
            ) : saveSuccess ? (
              <>
                <Check size={14} />
                Saved
              </>
            ) : (
              <>
                <Save size={14} />
                Save Changes
              </>
            )}
          </button>
        )}
      </div>

      <div className="space-y-4 p-5">
        {(error || loadError) && (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertDescription>{error || loadError}</AlertDescription>
          </Alert>
        )}
        {isLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
            <Loader2 size={14} className="animate-spin text-primary" />
            Loading settings…
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Target Audience */}
            <div className="space-y-2">
              <label className={labelClass}>
                Target audience
              </label>
              <div className="relative">
                <select
                  value={currentState.targetAudience}
                  onChange={(e) => handleAudienceChange(e.target.value)}
                  className={selectFieldClass}
                >
                  <option value="kids">Kids (4-8 years)</option>
                  <option value="preteens">Pre-teens (9-12 years)</option>
                  <option value="teens">Teens (13-17 years)</option>
                  <option value="general">General Audience</option>
                </select>
              </div>
            </div>

            {/* Tone */}
            <div className="space-y-2">
              <label className={labelClass}>
                Tone
              </label>
              <div className="relative">
                <select
                  value={currentState.tone}
                  onChange={(e) => handleToneChange(e.target.value)}
                  className={selectFieldClass}
                >
                  <option value="educational">Educational & Fun</option>
                  <option value="adventurous">Adventurous</option>
                  <option value="humorous">Humorous</option>
                  <option value="emotional">Emotional & Heartwarming</option>
                </select>
              </div>
            </div>

            {/* AI Model */}
            <div className="space-y-2">
              <label className={labelClass}>
                AI model for writing
              </label>
              <div className="relative">
                <select
                  value={currentState.aiModel}
                  onChange={(e) => handleModelChange(e.target.value)}
                  className={selectFieldClass}
                >
                  <option value="claude">Claude</option>
                  <option value="kimi2.5">Kimi 2.5</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
