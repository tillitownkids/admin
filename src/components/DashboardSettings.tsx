'use client';

import { Users, Type, Sparkles, Save, Check, Loader2, Cpu } from "lucide-react";
import { useState, useEffect } from "react";
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

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    async function loadSettings() {
      setIsLoading(true);
      try {
        const res = await getGlobalSettingsAction();
        if (res.success && res.settings) {
          const loaded = {
            targetAudience: res.settings.targetAudience || 'kids',
            tone: res.settings.tone || 'educational',
            aiModel: res.settings.aiModel || 'claude',
          };
          setSavedState(loaded);
          setCurrentState(loaded);
        }
      } catch (err) {
        console.error("Failed to load global settings from DB:", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadSettings();
  }, []);

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
    try {
      const res = await saveGlobalSettingsAction({
        targetAudience: currentState.targetAudience,
        tone: currentState.tone,
        aiModel: currentState.aiModel,
      });

      console.log('[GLOBAL STORY SETTINGS SAVED TO DATABASE]', res);

      if (res.success) {
        setSavedState(currentState);
        setSaveSuccess(true);
        // Sync localStorage for fallback
        localStorage.setItem('targetAudience', currentState.targetAudience);
        localStorage.setItem('tone', currentState.tone);
        localStorage.setItem('aiModel', currentState.aiModel);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (err) {
      console.error("Failed to save global settings to DB:", err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-card text-card-foreground rounded-xl border border-border flex flex-col h-fit overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold tracking-tight">Global Story Settings</h2>
        </div>

        {/* Save Changes button appears ONLY when inputs are modified */}
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
                Saved to DB!
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

      <div className="p-5">
        {isLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
            <Loader2 size={14} className="animate-spin text-primary" />
            Loading global settings from database...
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Target Audience */}
            <div className="space-y-2">
              <label className={labelClass}>
                <Users className="w-4 h-4 text-primary" />
                Target Audience
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
                <Type className="w-4 h-4 text-primary" />
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
                <Cpu className="w-4 h-4 text-primary" />
                AI Model
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
