"use client";

import { callAi } from "@/actions/actions";
import { getStoriesAction, saveGeneratedStoryAction } from "@/actions/saveStoryAction";
import { getGlobalSettingsAction } from "@/actions/settingsAction";
import { PageHeader } from "@/components/PageHeader";
import { GlassPanel } from "@/components/GlassPanel";
import { fieldClass, labelClass, primaryButtonClass, secondaryButtonClass, selectFieldClass } from "@/lib/styles";
import { useState, useEffect } from "react";

import { useRouter } from "next/navigation";
import { 
  Sparkles, 
  BookOpen, 
  FileText, 
  GraduationCap, 
  Loader2, 
  X, 
  Wand2, 
  RefreshCw, 
  Layers, 
  History, 
  BookMarked,
  Clock,
  Plus,
  ArrowRight,
  Clapperboard,
  LayoutTemplate,
  MapPin,
  Check
} from "lucide-react";

interface ScriptInput {
  Concept: string;
  Overview: string;
  Lesson: string;
}

interface StoryRecord {
  id: string;
  topic?: string;
  concept?: string;
  storyOverview?: string;
  teachLesson?: string;
  content?: string;
  generation_type?: string;
  mode?: string;
  episode_number?: string;
  generated_at?: string;
  status?: string;
}

interface PendingLocation {
  name: string;
  description: string;
  added?: boolean;
  rejected?: boolean;
}

export default function StoryPage() {
  const router = useRouter();

  const [viewMode, setViewMode] = useState<'list' | 'form'>('list');
  const [stories, setStories] = useState<StoryRecord[]>([]);
  const [isFetchingStories, setIsFetchingStories] = useState<boolean>(true);

  const [generationType, setGenerationType] = useState<'new' | 'continue'>('new');
  const [previousEpisodeId, setPreviousEpisodeId] = useState<string>('');
  const [previousContext, setPreviousContext] = useState<string>('');
  const [duration, setDuration] = useState<string>('2-3 minutes');

  const [data, setData] = useState<ScriptInput>({
    Concept: "",
    Overview: "",
    Lesson: "",
  });

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [locations, setLocations] = useState<any[]>([]);
  const [characters, setCharacters] = useState<any[]>([]);
  const [isFetchingDetails, setIsFetchingDetails] = useState<boolean>(false);

  const [pendingLocations, setPendingLocations] = useState<PendingLocation[]>([]);
  const [pendingStoryText, setPendingStoryText] = useState<string>('');
  const [showLocationModal, setShowLocationModal] = useState<boolean>(false);
  const [isSavingLocation, setIsSavingLocation] = useState<string | null>(null);

  useEffect(() => {
    loadStories();
    loadLocationsAndCharacters();
  }, []);

  async function loadLocationsAndCharacters() {
    setIsFetchingDetails(true);
    try {
      const [locationsRes, charactersRes] = await Promise.all([
        fetch('/api/locations'),
        fetch('/api/characters'),
      ]);

      if (locationsRes.ok) {
        const locData = await locationsRes.json();
        const locs = locData.locations || [];
        setLocations(locs);
      }

      if (charactersRes.ok) {
        const charData = await charactersRes.json();
        const chars = charData.characters || [];
        setCharacters(chars);
      }
    } catch (err) {
      console.error("Error fetching locations and characters:", err);
    } finally {
      setIsFetchingDetails(false);
    }
  }

  async function loadStories() {
    setIsFetchingStories(true);
    const res = await getStoriesAction();
    if (res.success && res.stories) {
      setStories(res.stories);
    }
    setIsFetchingStories(false);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    setData((prev) => ({ ...prev, [name]: value }));
  }

  function handleClear() {
    setData({ Concept: "", Overview: "", Lesson: "" });
    setGenerationType('new');
    setPreviousEpisodeId('');
    setPreviousContext('');
    setDuration('2-3 minutes');
    setError(null);
  }

  function handlePreviousEpisodeChange(episodeId: string) {
    setPreviousEpisodeId(episodeId);
    if (!episodeId) {
      setPreviousContext('');
      return;
    }
    const selected = stories.find((s) => s.id === episodeId);
    if (selected && selected.content) {
      const plainText = selected.content.replace(/<[^>]+>/g, ' ').slice(0, 500);
      setPreviousContext(plainText);
    }
  }

  const [isAcceptingAll, setIsAcceptingAll] = useState<boolean>(false);
  const [activeCharacterIds, setActiveCharacterIds] = useState<string[]>([]);
  const [activeLocationIds, setActiveLocationIds] = useState<string[]>([]);

  async function handleAddLocationToDb(loc: PendingLocation, index: number) {
    setIsSavingLocation(loc.name);
    try {
      const res = await fetch('/api/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: loc.name, description: loc.description || '' }),
      });

      if (res.ok) {
        const resData = await res.json();
        const createdLoc = resData.location || { name: loc.name, description: loc.description };
        setLocations((prev) => [...prev, createdLoc]);
        if (createdLoc.id) {
          setActiveLocationIds((prev) => Array.from(new Set([...prev, createdLoc.id])));
        }
        setPendingLocations((prev) =>
          prev.map((item, idx) => (idx === index ? { ...item, added: true, rejected: false } : item))
        );
      }
    } catch (err) {
      console.error("Error adding location:", err);
    } finally {
      setIsSavingLocation(null);
    }
  }

  function handleRejectLocation(index: number) {
    setPendingLocations((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, rejected: true, added: false } : item))
    );
  }

  async function handleAcceptAllLocations() {
    setIsAcceptingAll(true);
    try {
      const unaddedLocations = pendingLocations.filter((l) => !l.added && !l.rejected);
      const newLocIds: string[] = [];

      await Promise.all(
        unaddedLocations.map(async (loc) => {
          try {
            const res = await fetch('/api/locations', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: loc.name, description: loc.description || '' }),
            });
            if (res.ok) {
              const resData = await res.json();
              const createdLoc = resData.location || { name: loc.name, description: loc.description };
              setLocations((prev) => [...prev, createdLoc]);
              if (createdLoc.id) {
                newLocIds.push(createdLoc.id);
              }
            }
          } catch (e) {
            console.error("Failed to add location:", loc.name, e);
          }
        })
      );

      const allLocIds = Array.from(new Set([...activeLocationIds, ...newLocIds]));
      setActiveLocationIds(allLocIds);
      setPendingLocations((prev) => prev.map((item) => ({ ...item, added: true, rejected: false })));

      await finalizeSaveStory(pendingStoryText, undefined, activeCharacterIds, allLocIds);
    } catch (err) {
      console.error("Error accepting all locations:", err);
    } finally {
      setIsAcceptingAll(false);
    }
  }

  async function finalizeSaveStory(
    storyContent: string, 
    targetRedirect?: string,
    overrideCharIds?: string[],
    overrideLocIds?: string[]
  ) {
    setIsLoading(true);
    try {
      const charIdsToSave = overrideCharIds || activeCharacterIds;
      const locIdsToSave = overrideLocIds || activeLocationIds;

      const saveRes = await saveGeneratedStoryAction({
        topic: data.Concept ? (data.Concept.length > 50 ? data.Concept.slice(0, 50) + "..." : data.Concept) : "Bedtime Story",
        episode_number: "1",
        generation_type: generationType || "new",
        content: storyContent,
        status: "active",
        characterIds: charIdsToSave,
        locationIds: locIdsToSave,
      });

      if (saveRes.success && saveRes.story?.id) {
        setShowLocationModal(false);
        router.push(targetRedirect || `/story-generate/${saveRes.story.id}`);
      } else {
        setError(saveRes.error || "Failed to save generated story to database.");
      }
    } catch (err: any) {
      setError(err?.message || "Failed to save story.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!data.Concept.trim() && !data.Overview.trim() && !data.Lesson.trim()) {
      setError("Please fill in at least one of the fields before generating.");
      setTimeout(() => setError(null), 5000);
      return;
    }

    setIsLoading(true);
    setError(null);

    let globalAudience = 'Kids (4-8 years)';
    let globalTone = 'Educational & Fun';

    try {
      const dbSettingsRes = await getGlobalSettingsAction();
      if (dbSettingsRes.success && dbSettingsRes.settings) {
        globalAudience = dbSettingsRes.settings.targetAudience || globalAudience;
        globalTone = dbSettingsRes.settings.tone || globalTone;
      } else {
        globalAudience = localStorage.getItem('targetAudience') || globalAudience;
        globalTone = localStorage.getItem('tone') || globalTone;
      }
    } catch {
      globalAudience = localStorage.getItem('targetAudience') || globalAudience;
      globalTone = localStorage.getItem('tone') || globalTone;
    }

    const selectedPreviousStory = stories.find((s) => s.id === previousEpisodeId);
    const contextToUse = previousContext.trim() || (selectedPreviousStory?.content ? selectedPreviousStory.content.replace(/<[^>]+>/g, ' ').slice(0, 600) : "");

    const continuationHeader = generationType === 'continue'
      ? `\n- Generation Mode: Continuation Episode (Sequential episode in an ongoing story arc)
${contextToUse ? `- Previous Episode Summary / Context: ${contextToUse}` : ''}`
      : `\n- Generation Mode: New Story (Standalone story episode)`;

    const charactersListStr = characters.length > 0
      ? characters.map((c: any) => `- Name: ${c.name}${c.description ? ` (${c.description})` : ''}`).join('\n')
      : 'None in database';

    const locationsListStr = locations.length > 0
      ? locations.map((l: any) => `- Name: ${l.name}${l.description ? ` (${l.description})` : ''}`).join('\n')
      : 'None in database';

    const prompt = `
You are a creative director and storyteller for the children's animated show "Tilli & Jaksh."

Generation Mode Details: ${continuationHeader}
Target Story Duration: ${duration || '2-3 minutes'}
Target Audience: ${globalAudience}
Story Tone & Atmosphere: ${globalTone}

CHARACTERS RULE & STRICT CHARACTER FIDELITY (STRICT CRITICAL):
- You MUST strictly use ONLY the characters present in the database listed below.
- Do NOT introduce, create, or invent any new characters under any circumstances.
- STRICT CHARACTER FIDELITY: NEVER INVENT, ASSUME, OR FABRICATE physical traits, body mechanics, technological qualities (such as wheels, robot parts, metal chassis, engines, camera eyes, or gadgets), powers, or unstated equipment for any character.
- DO NOT describe any character as a robot, machine, mechanical companion, or as having wheels, engines, metallic parts, glowing eyes, or spinning compasses UNLESS those exact traits are explicitly stated in their official database character description below.
- For example: If a character is named "Tilli", describe Tilli strictly as defined in their character profile below. DO NOT add "on wheels", "robot", "mechanical companion", or any unmentioned fantasy/scifi traits.
- Available Database Characters:
${charactersListStr}

LOCATIONS RULE:
- Prefer using existing locations from the database listed below when appropriate for the scene.
- YOU ARE FREELY ALLOWED TO INVENT AND INTRODUCE NEW LOCATIONS whenever the story plot or adventure requires new settings!
- Whenever a new setting is introduced, describe it vividly in the narrative and list it in the locationsUsed output array so it can be added to the database.
- Available Database Locations:
${locationsListStr}

Given Inputs:
- Story Concept: ${data.Concept}
- Story Overview: ${data.Overview}
- Lesson to be Taught: ${data.Lesson}
- Time Duration Target: ${duration || '2-3 minutes'}
- Target Audience: ${globalAudience}
- Story Tone & Atmosphere: ${globalTone}

STORY FORMATTING RULES (STRICT & MANDATORY):
- Write a single, continuous, warm bedtime narrative story.
- Do NOT divide or split the story into "Part 1", "Part 2", "Part 3", chapters, or sub-sections.
- Do NOT use horizontal divider lines ("---") inside the story text.
- Do NOT include screenplay directions, camera cues, or dialogue lists.
- Write in clean, flowing narrative paragraphs with natural character dialogue.

Requirements:
- Build the story around the provided concept and overview while naturally conveying the given lesson.
- Keep the narrative length and pacing aligned with the target duration (${duration || '2-3 minutes'}).
- TARGET AUDIENCE CONSTRAINT: Adapt vocabulary, dialogue complexity, and themes strictly for ${globalAudience}.
- TONE & ATMOSPHERE CONSTRAINT: Maintain a strictly ${globalTone} tone and emotional atmosphere throughout the entire narrative.
${generationType === 'continue' ? '- Maintain plot and character continuity from the previous episode events.' : '- Create a clear, engaging standalone story.'}
- Use ONLY characters from the database list above.
- Include natural dialogue for every character involved.
- Give the story a clear beginning, middle, and satisfying ending.
- Let the lesson emerge naturally through the characters' actions and experiences.

OUTPUT FORMAT:
Return ONLY valid JSON matching this exact structure:

{
  "story": "# **[Story Title]**\\n\\n[Single continuous bedtime narrative story in paragraphs without Part headings or --- dividers]\\n\\n### **Episode Recap**\\n**Summary:** [1-paragraph summary recap of this episode]",
  "locationsUsed": [
    {
      "name": "Location Name",
      "description": "Short description of the location setting"
    }
  ]
}`;

    try {
      const response = await callAi(prompt);
      const rawText = typeof response === "string" ? response : response?.text || "";

      if (!rawText) {
        throw new Error("No response text returned from AI.");
      }

      let storyText = "";
      let locationsUsed: { name: string; description: string }[] = [];

      try {
        const cleanedJson = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        const parsed = JSON.parse(cleanedJson);
        if (parsed.story) {
          storyText = parsed.story;
        } else {
          storyText = rawText;
        }
        if (Array.isArray(parsed.locationsUsed)) {
          locationsUsed = parsed.locationsUsed;
        }
      } catch {
        storyText = rawText;
      }

      // Collect all character IDs available in the DB
      const charIds = characters.map((c: any) => c.id).filter(Boolean);
      setActiveCharacterIds(charIds);

      // Collect matched existing location IDs from DB
      const existingLocMap = new Map<string, string>();
      locations.forEach((l: any) => {
        if (l.name && l.id) {
          existingLocMap.set(l.name.toLowerCase().trim(), l.id);
        }
      });

      const initialLocIds: string[] = [];
      locationsUsed.forEach((loc) => {
        if (loc.name) {
          const matchedId = existingLocMap.get(loc.name.toLowerCase().trim());
          if (matchedId) initialLocIds.push(matchedId);
        }
      });

      const uniqueInitialLocIds = Array.from(new Set(initialLocIds));
      setActiveLocationIds(uniqueInitialLocIds);

      const existingLocNames = new Set(locations.map((l: any) => l.name.toLowerCase().trim()));
      const detectedNewLocs = locationsUsed.filter(
        (loc) => loc.name && !existingLocNames.has(loc.name.toLowerCase().trim())
      );

      if (detectedNewLocs.length > 0) {
        setPendingLocations(detectedNewLocs.map((l) => ({ name: l.name, description: l.description })));
        setPendingStoryText(storyText);
        setShowLocationModal(true);
        setIsLoading(false);
      } else {
        await finalizeSaveStory(storyText, undefined, charIds, uniqueInitialLocIds);
      }
    } catch (err: any) {
      console.error("Error generating story:", err);
      setError(err?.message || "An error occurred while generating the story.");
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader
          icon={BookOpen}
          title="Story"
          highlight={viewMode === 'form' ? "Generator" : "Library"}
          description={
            viewMode === 'form' 
              ? "Craft warm bedtime stories for Tilli & Jaksh driven by custom concepts, overviews, and lessons."
              : "Explore all generated bedtime stories or create a new story for Tilli & Jaksh."
          }
        />
      </div>

      {error && (
        <div className="p-4 bg-destructive/10 text-destructive border border-destructive/20 rounded-lg flex items-center justify-between animate-in fade-in duration-300">
          <div className="flex items-center gap-2">
            <X className="w-4 h-4 cursor-pointer" onClick={() => setError(null)} />
            <span className="text-sm font-medium">{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-destructive/80 hover:text-destructive">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {viewMode === 'list' ? (
        <div className="space-y-4 animate-in fade-in duration-300">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Create New Story Card */}
            <div
              onClick={() => {
                handleClear();
                setViewMode('form');
              }}
              className="cursor-pointer group flex flex-col items-center justify-center p-6 rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors duration-300 min-h-[220px]"
            >
              <div className="w-12 h-12 rounded-full bg-primary/20 text-primary flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <Plus className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-lg text-primary">Create New Story</h3>
              <p className="text-sm text-muted-foreground mt-1 text-center">Generate a new bedtime story episode driven by AI</p>
            </div>

            {/* List of Fetched Stories from Supabase */}
            {isFetchingStories ? (
              <div className="col-span-full py-12 flex flex-col items-center justify-center text-muted-foreground gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <p className="text-sm">Fetching stories from database...</p>
              </div>
            ) : stories.length === 0 ? (
              <div className="col-span-full sm:col-span-2 lg:col-span-2 p-8 rounded-2xl border border-dashed border-border flex flex-col items-center justify-center text-center text-muted-foreground">
                <BookOpen className="w-8 h-8 text-primary/40 mb-2" />
                <p className="font-medium text-sm">No stories generated yet.</p>
                <p className="text-xs text-muted-foreground mt-1">Click "Create New Story" above to craft your first bedtime story!</p>
              </div>
            ) : (
              stories.map((story) => (
                <div
                  key={story.id}
                  onClick={() => router.push(`/story-generate/${story.id}`)}
                  className="cursor-pointer group flex flex-col p-5 rounded-2xl border border-border bg-card hover:border-primary/50 transition-all duration-300 min-h-[220px] shadow-sm hover:shadow-md"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                      <Layers className="w-3 h-3 text-emerald-500" />
                      {story.generation_type === 'continue' ? 'Continuation' : 'New Story'}
                    </span>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {story.generated_at ? new Date(story.generated_at).toLocaleDateString() : 'Recent'}
                    </span>
                  </div>
                  
                  <h3 className="text-lg font-bold text-foreground mb-2 group-hover:text-primary transition-colors line-clamp-2">
                    {story.topic || story.concept?.slice(0, 50) || "Bedtime Story"}
                  </h3>

                  {story.content && (
                    <p className="text-xs text-muted-foreground line-clamp-3 mb-4 leading-relaxed">
                      {story.content.replace(/<[^>]+>/g, ' ')}
                    </p>
                  )}

                  <div className="mt-auto pt-3 border-t border-border/40 flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1 text-xs font-semibold text-primary group-hover:translate-x-0.5 transition-transform">
                      Open in Editor & Brainstorm <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        /* Create New Story Form */
        <GlassPanel
          footer={
            <div className="flex w-full items-center justify-between gap-4">
              <button
                type="button"
                onClick={handleClear}
                className={secondaryButtonClass}
                disabled={isLoading}
              >
                <RefreshCw className="w-4 h-4" />
                Reset Form
              </button>
              <button
                type="submit"
                form="story-form"
                disabled={isLoading}
                className={`${primaryButtonClass} group`}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating Story...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 group-hover:rotate-12 transition-transform duration-300" />
                    Generate Story
                  </>
                )}
              </button>
            </div>
          }
        >
          <form id="story-form" onSubmit={handleSubmit} className="space-y-6">
            {/* Top Option Selector */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-6 border-b border-border/40">
              <div className="space-y-1.5">
                <label className={labelClass}>
                  <Wand2 className="w-4 h-4 text-primary" />
                  Generation Type
                </label>
                <div className="flex bg-muted/50 p-1 rounded-xl w-fit border border-border/30">
                  <button
                    type="button"
                    onClick={() => setGenerationType('new')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                      generationType === 'new'
                        ? 'bg-background text-foreground border border-border/50'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Sparkles className="w-4 h-4 text-emerald-500" />
                    Write New Story
                  </button>
                  <button
                    type="button"
                    onClick={() => setGenerationType('continue')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                      generationType === 'continue'
                        ? 'bg-background text-foreground border border-border/50'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Layers className="w-4 h-4 text-emerald-500" />
                    Continuation Episode
                  </button>
                </div>
              </div>

              <div className="text-xs text-muted-foreground bg-muted/30 px-3 py-2 rounded-lg border border-border/20 max-w-xs">
                {generationType === 'new'
                  ? 'Create a brand-new standalone story episode.'
                  : 'Continue an ongoing story arc with plot and character continuity.'}
              </div>
            </div>

            {/* Continuation Episode Options */}
            {generationType === 'continue' && (
              <div className="p-4 rounded-xl border space-y-4 animate-in fade-in duration-300">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className={labelClass}>
                      <History className="w-4 h-4 text-emerald-500" />
                      Previous Episode (Optional)
                    </label>
                    <div className="relative">
                      <select
                        value={previousEpisodeId}
                        onChange={(e) => handlePreviousEpisodeChange(e.target.value)}
                        className={selectFieldClass}
                      >
                        <option value="">-- Select from History --</option>
                        {stories.map((story) => (
                          <option key={story.id} value={story.id}>
                            {story.topic || story.concept?.slice(0, 40) || 'Untitled Story'}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className={labelClass}>
                      <BookMarked className="w-4 h-4 text-emerald-500" />
                      Previous Episode Recap / Context
                    </label>
                    <textarea
                      value={previousContext}
                      onChange={(e) => setPreviousContext(e.target.value)}
                      rows={2}
                      className={fieldClass}
                      placeholder="Enter what happened in the previous episode or context to continue from..."
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Time Duration Input */}
            <div className="space-y-2">
              <label className={labelClass}>
                <Clock className="w-4 h-4 text-primary" />
                Time Duration
              </label>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <input
                    type="text"
                    name="Duration"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    className={fieldClass}
                    placeholder="e.g. 2-3 minutes, 5 minutes, 30 seconds..."
                  />
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {['1 min', '2-3 min', '5 min', '10 min'].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setDuration(preset)}
                      className={`px-3 py-2.5 rounded-lg text-xs font-semibold border transition-all ${
                        duration === preset
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background/80 border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className={labelClass}>
                <Sparkles className="w-4 h-4 text-primary" />
                Concept
              </label>
              <textarea
                name="Concept"
                value={data.Concept}
                onChange={handleChange}
                rows={3}
                className={fieldClass}
                placeholder="Enter the core story concept or premise..."
              />
            </div>

            <div className="space-y-2">
              <label className={labelClass}>
                <FileText className="w-4 h-4 text-primary" />
                Story Overview
              </label>
              <textarea
                name="Overview"
                value={data.Overview}
                onChange={handleChange}
                rows={4}
                className={fieldClass}
                placeholder="Outline key events, character actions, and plot progression..."
              />
            </div>

            <div className="space-y-2">
              <label className={labelClass}>
                <GraduationCap className="w-4 h-4 text-primary" />
                Teach Lesson
              </label>
              <textarea
                name="Lesson"
                value={data.Lesson}
                onChange={handleChange}
                rows={3}
                className={fieldClass}
                placeholder="Moral or key educational takeaway (e.g. sharing, honesty, kindness)..."
              />
            </div>
          </form>
        </GlassPanel>
      )}

      {/* New Location Modal Dialog */}
      {showLocationModal && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="max-w-lg w-full bg-card border border-border rounded-2xl p-6 shadow-2xl space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-primary" />
                  New Location Detected
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  The generated story introduced new location(s) not currently in your database. Would you like to add them to your location library?
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowLocationModal(false)}
                className="text-muted-foreground hover:text-foreground p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
              {pendingLocations.map((loc, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-xl border border-border bg-muted/30 space-y-3"
                >
                  <div>
                    <h4 className="font-bold text-foreground text-sm">{loc.name}</h4>
                    {loc.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">{loc.description}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {loc.added ? (
                      <span className="text-xs text-emerald-500 font-semibold flex items-center gap-1">
                        <Check className="w-4 h-4" /> Added to Database
                      </span>
                    ) : loc.rejected ? (
                      <span className="text-xs text-muted-foreground font-medium italic">
                        Rejected (Will not be saved)
                      </span>
                    ) : (
                      <>
                        <button
                          type="button"
                          disabled={isSavingLocation === loc.name}
                          onClick={() => handleAddLocationToDb(loc, idx)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition disabled:opacity-50 cursor-pointer"
                        >
                          {isSavingLocation === loc.name ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Plus className="w-3.5 h-3.5" />
                          )}
                          Add Location
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRejectLocation(idx)}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-muted hover:bg-muted/80 text-muted-foreground text-xs font-medium transition cursor-pointer"
                        >
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
              <button
                type="button"
                onClick={handleAcceptAllLocations}
                disabled={isLoading || isAcceptingAll}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-primary/30 bg-primary/10 text-primary text-sm font-semibold hover:bg-primary/20 transition disabled:opacity-50 cursor-pointer"
              >
                {isAcceptingAll ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Accepting All...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Accept All
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => finalizeSaveStory(pendingStoryText)}
                disabled={isLoading || isAcceptingAll}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition disabled:opacity-50 cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving Story...
                  </>
                ) : (
                  <>
                    <span>Continue to Story</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
