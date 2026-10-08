"use client";

import { callAi } from "@/actions/actions";
import { getStoryDurationBudget } from "@/lib/storyDurationBudget";
import { episodeTitle } from "@/lib/episodeSteps";
import { getStoriesAction, saveGeneratedStoryAction } from "@/actions/saveStoryAction";
import { getGlobalSettingsAction } from "@/actions/settingsAction";
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
  Users,
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

type PendingCharacter = PendingLocation;

interface LibraryItem {
  id: string;
  name: string;
  description?: string;
}

const normalizedName = (name: string) => name.trim().toLocaleLowerCase();
const errorMessage = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

export function StoryGenerator() {
  const router = useRouter();

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

  const [locations, setLocations] = useState<LibraryItem[]>([]);
  const [characters, setCharacters] = useState<LibraryItem[]>([]);
  const [isFetchingDetails, setIsFetchingDetails] = useState<boolean>(false);

  const [pendingLocations, setPendingLocations] = useState<PendingLocation[]>([]);
  const [pendingCharacters, setPendingCharacters] = useState<PendingCharacter[]>([]);
  const [pendingStoryText, setPendingStoryText] = useState<string>('');
  const [showReviewModal, setShowReviewModal] = useState<boolean>(false);
  const [isSavingLocation, setIsSavingLocation] = useState<string | null>(null);
  const [isSavingCharacter, setIsSavingCharacter] = useState<string | null>(null);
  const [pendingSavedStoryId, setPendingSavedStoryId] = useState<string | null>(null);

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
    setPendingSavedStoryId(null);
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
  const [acceptedCharacterIds, setAcceptedCharacterIds] = useState<string[]>([]);
  const [acceptedLocationIds, setAcceptedLocationIds] = useState<string[]>([]);
  const [savePhase, setSavePhase] = useState<'references' | 'story' | null>(null);

  async function createCharacter(char: PendingCharacter) {
    const res = await fetch('/api/characters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: char.name.trim(), description: char.description.trim() }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Failed to add character "${char.name}".`);
    }
    const body = await res.json();
    if (!body.character?.id) throw new Error(`Character "${char.name}" was not saved.`);
    setCharacters((prev) => [...prev, body.character]);
    setActiveCharacterIds((prev) => Array.from(new Set([...prev, body.character.id])));
    return body.character.id as string;
  }

  async function handleAddCharacterToDb(char: PendingCharacter, index: number) {
    setIsSavingCharacter(char.name);
    setError(null);
    try {
      const characterId = await createCharacter(char);
      setAcceptedCharacterIds((prev) => Array.from(new Set([...prev, characterId])));
      setPendingCharacters((prev) => prev.map((item, idx) => idx === index ? { ...item, added: true, rejected: false } : item));
    } catch (err: unknown) {
      setError(errorMessage(err, 'Failed to add character.'));
    } finally {
      setIsSavingCharacter(null);
    }
  }

  function handleRejectCharacter(index: number) {
    setPendingCharacters((prev) => prev.map((item, idx) => idx === index ? { ...item, rejected: true } : item));
  }

  async function handleAddLocationToDb(loc: PendingLocation, index: number) {
    setIsSavingLocation(loc.name);
    setError(null);
    try {
      const res = await fetch('/api/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: loc.name, description: loc.description || '' }),
      });

      if (res.ok) {
        const resData = await res.json();
        const createdLoc = resData.location;
        if (!createdLoc?.id) throw new Error(`Location "${loc.name}" was not saved.`);
        setLocations((prev) => [...prev, createdLoc]);
        setActiveLocationIds((prev) => Array.from(new Set([...prev, createdLoc.id])));
        setAcceptedLocationIds((prev) => Array.from(new Set([...prev, createdLoc.id])));
        setPendingLocations((prev) =>
          prev.map((item, idx) => (idx === index ? { ...item, added: true, rejected: false } : item))
        );
      } else {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed to add location "${loc.name}".`);
      }
    } catch (err: unknown) {
      setError(errorMessage(err, 'Failed to add location.'));
    } finally {
      setIsSavingLocation(null);
    }
  }

  function handleRejectLocation(index: number) {
    setPendingLocations((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, rejected: true, added: false } : item))
    );
  }

  async function handleAcceptAll() {
    setIsAcceptingAll(true);
    setError(null);
    try {
      const unaddedCharacters = pendingCharacters.filter((c) => !c.added && !c.rejected);
      const newCharIds: string[] = [];
      for (const char of unaddedCharacters) {
        newCharIds.push(await createCharacter(char));
        setPendingCharacters((prev) => prev.map((item) => item === char ? { ...item, added: true } : item));
      }
      const unaddedLocations = pendingLocations.filter((l) => !l.added && !l.rejected);
      const newLocIds: string[] = [];

      for (const loc of unaddedLocations) {
            const res = await fetch('/api/locations', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: loc.name, description: loc.description || '' }),
            });
            if (!res.ok) throw new Error(`Failed to add location "${loc.name}".`);
            const resData = await res.json();
            const createdLoc = resData.location;
            if (!createdLoc?.id) throw new Error(`Location "${loc.name}" was not saved.`);
            setLocations((prev) => [...prev, createdLoc]);
            newLocIds.push(createdLoc.id);
            setPendingLocations((prev) => prev.map((item) => item === loc ? { ...item, added: true } : item));
      }

      const allLocIds = Array.from(new Set([...activeLocationIds, ...newLocIds]));
      const allCharIds = Array.from(new Set([...activeCharacterIds, ...newCharIds]));
      const allAcceptedLocIds = Array.from(new Set([...acceptedLocationIds, ...newLocIds]));
      const allAcceptedCharIds = Array.from(new Set([...acceptedCharacterIds, ...newCharIds]));
      setActiveLocationIds(allLocIds);
      setActiveCharacterIds(allCharIds);
      setAcceptedLocationIds(allAcceptedLocIds);
      setAcceptedCharacterIds(allAcceptedCharIds);
      await finalizeSaveStory(
        pendingStoryText,
        undefined,
        allCharIds,
        allLocIds,
        allAcceptedCharIds,
        allAcceptedLocIds,
      );
    } catch (err: unknown) {
      setError(errorMessage(err, 'Failed to add suggested characters or locations.'));
    } finally {
      setIsAcceptingAll(false);
    }
  }

  async function finalizeSaveStory(
    storyContent: string, 
    targetRedirect?: string,
    overrideCharIds?: string[],
    overrideLocIds?: string[],
    overrideAcceptedCharIds?: string[],
    overrideAcceptedLocIds?: string[],
  ) {
    setIsLoading(true);
    setError(null);
    try {
      const charIdsToSave = overrideCharIds || activeCharacterIds;
      const locIdsToSave = overrideLocIds || activeLocationIds;
      const characterIdsToGenerate = overrideAcceptedCharIds || acceptedCharacterIds;
      const locationIdsToGenerate = overrideAcceptedLocIds || acceptedLocationIds;

      if (characterIdsToGenerate.length > 0 || locationIdsToGenerate.length > 0) {
        setSavePhase('references');
        const generationRes = await fetch('/api/references/generate-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            characterIds: characterIdsToGenerate,
            locationIds: locationIdsToGenerate,
          }),
        });
        const generationData = await generationRes.json().catch(() => ({}));
        if (!generationRes.ok) {
          const failures = Array.isArray(generationData.failed) ? generationData.failed : [];
          const failureSummary = failures
            .map((failure: { type?: string; id?: string; error?: string }) =>
              failure.error || `${failure.type || 'reference'} ${failure.id || ''} failed`.trim()
            )
            .join('; ');
          throw new Error(
            failureSummary
              ? `Some accepted references could not be generated: ${failureSummary}`
              : generationData.error || 'Accepted references could not be generated.'
          );
        }
      }

      setSavePhase('story');
      const saveRes = await saveGeneratedStoryAction({
        id: pendingSavedStoryId || undefined,
        topic: data.Concept ? (data.Concept.length > 50 ? data.Concept.slice(0, 50) + "..." : data.Concept) : "Bedtime Story",
        episode_number: "1",
        generation_type: generationType || "new",
        content: storyContent,
        status: "active",
        characterIds: charIdsToSave,
        locationIds: locIdsToSave,
      });

      if (saveRes.success && saveRes.story?.id) {
        setAcceptedCharacterIds([]);
        setAcceptedLocationIds([]);
        setShowReviewModal(false);
        router.push(targetRedirect || `/episodes/${saveRes.story.id}/story`);
      } else {
        if (saveRes.story?.id) setPendingSavedStoryId(saveRes.story.id);
        setError(saveRes.error || "The story was written but could not be saved. Try again.");
      }
    } catch (err: unknown) {
      setError(errorMessage(err, "Failed to save story."));
    } finally {
      setSavePhase(null);
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
    setPendingSavedStoryId(null);

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
      ? characters.map((c) => `- Name: ${c.name}${c.description ? ` (${c.description})` : ''}`).join('\n')
      : 'None in database';

    const locationsListStr = locations.length > 0
      ? locations.map((l) => `- Name: ${l.name}${l.description ? ` (${l.description})` : ''}`).join('\n')
      : 'None in database';

    const storyDuration = duration.trim() || '2-3 minutes';
    const durationBudget = getStoryDurationBudget(storyDuration);
    if (!durationBudget) {
      setError('Enter a duration such as 2-3 minutes, 5 min, or 30 seconds.');
      setIsLoading(false);
      return;
    }

    const prompt = `
You are a creative director and storyteller for the children's animated show "Tillitown"

Generation Mode Details: ${continuationHeader}
Target Story Duration: ${storyDuration}
Target Spoken Dialogue: ${durationBudget.minimumDialogueWords}–${durationBudget.maximumDialogueWords} words
Target Audience: ${globalAudience}
Story Tone & Atmosphere: ${globalTone}

CHARACTERS RULE & STRICT CHARACTER FIDELITY:
- Prefer existing database characters when they can fulfill the roles in the story.
- If the concept, overview, or plot needs a character the database cannot supply, create only the minimum new characters needed.
- Preserve every existing character's profile exactly. Do not invent physical traits, body mechanics, technological qualities, powers, or equipment for existing characters.
- Give each new character a short, concrete description consistent with the story. Do not add unrelated traits or abilities.
- List every character actually present in the narrative in charactersUsed. Use the exact database name for existing characters. Do not list characters absent from the story.
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

STRICT FINISHED-EPISODE RUNTIME LIMIT:
- The selected story duration is ${storyDuration}. This is the runtime budget for the FINISHED ANIMATED EPISODE, not the time needed to read the narrative aloud.
- Aim for ${durationBudget.targetSeconds} seconds of episode content. The hard upper runtime limit is ${durationBudget.maximumSeconds} seconds. For a range, this target uses its midpoint and the ceiling uses its upper bound.
- Budget the complete beginning, middle, and ending within this limit, including natural spoken dialogue, pauses, reactions, action, establishing moments, transitions, and a brief ending hold.
- Estimate speech at a natural, unhurried pace appropriate to the audience and tone. Do not assume dialogue or physical actions take no time.
- Allow compatible actions to happen during dialogue where natural, but do not assume unrelated or sequential events happen simultaneously to make the runtime fit.
- Keep the number of events, locations, conversations, and plot complications achievable within the available runtime. Avoid repetitive reactions, unnecessary detours, and extended celebrations.
- If the concept or overview is too large, simplify supporting events and shorten dialogue while preserving the central conflict, essential character roles, lesson, and satisfying ending.
- Never fit the runtime by rushing speech or action, cutting words off, leaving the resolution incomplete, or assigning unrealistically short durations.
- Before returning, internally estimate the full episode runtime and revise the story until it fits the selected limit. Keep this planning internal; retain the requested narrative and JSON output format.
- The Episode Recap is metadata and is excluded from episode runtime.

SPOKEN DIALOGUE BUDGET:
- Target ${durationBudget.minimumDialogueWords}–${durationBudget.maximumDialogueWords} spoken dialogue words across the complete story.
- Count only words actually spoken by characters. Exclude descriptive narrative, character labels, the title, and the Episode Recap.
- This range is a planning target, not permission to exceed the finished-episode runtime limit. Leave time for pauses, speaker changes, visible action, transitions, and the ending.
- Longer stories must contain meaningfully more developed events and conversations, not merely longer descriptions of the same events.
- Keep dialogue natural, purposeful, and appropriate to the audience, with manageable sentences and clear speaker exchanges. Do not pad conversations or rush delivery to meet a word count.
- Before returning, internally review the spoken-word count and likely screen runtime, and revise the story to satisfy both. Do not display word counts, timing sections, or planning notes. Keep the existing narrative and JSON format unchanged.

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
- Use existing characters where suitable and introduce new characters only when the story needs them.
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
  ],
  "charactersUsed": [
    {
      "name": "Character Name",
      "description": "For a new character, a brief profile grounded in the story; for an existing character, use its database description"
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
      let charactersUsed: { name: string; description: string }[] = [];

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
        if (Array.isArray(parsed.charactersUsed)) {
          charactersUsed = parsed.charactersUsed;
        }
      } catch {
        storyText = rawText;
      }

      const existingCharMap = new Map(characters.filter((c) => c.name && c.id).map((c) => [normalizedName(c.name), c.id]));
      const charIds = Array.from(new Set(charactersUsed
        .filter((char) => typeof char?.name === 'string')
        .map((char) => existingCharMap.get(normalizedName(char.name)))
        .filter((id): id is string => Boolean(id))));
      setActiveCharacterIds(charIds);

      const seenNewCharacters = new Set<string>();
      const detectedNewChars = charactersUsed.filter((char) => {
        if (typeof char?.name !== 'string' || !char.name.trim()) return false;
        const name = normalizedName(char.name);
        if (existingCharMap.has(name) || seenNewCharacters.has(name)) return false;
        seenNewCharacters.add(name);
        return true;
      });

      // Collect matched existing location IDs from DB
      const existingLocMap = new Map<string, string>();
      locations.forEach((l) => {
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

      const existingLocNames = new Set(locations.map((l) => normalizedName(l.name)));
      const detectedNewLocs = locationsUsed.filter(
        (loc) => loc.name && !existingLocNames.has(loc.name.toLowerCase().trim())
      );

      if (detectedNewLocs.length > 0 || detectedNewChars.length > 0) {
        setAcceptedCharacterIds([]);
        setAcceptedLocationIds([]);
        setPendingLocations(detectedNewLocs.map((l) => ({ name: l.name.trim(), description: l.description || '' })));
        setPendingCharacters(detectedNewChars.map((c) => ({ name: c.name.trim(), description: c.description || '' })));
        setPendingStoryText(storyText);
        setShowReviewModal(true);
        setIsLoading(false);
      } else {
        await finalizeSaveStory(storyText, undefined, charIds, uniqueInitialLocIds, [], []);
      }
    } catch (err: unknown) {
      console.error("Error generating story:", err);
      setError(errorMessage(err, "An error occurred while generating the story."));
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-4 bg-destructive/10 text-destructive border border-destructive/20 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <X className="w-4 h-4 cursor-pointer" onClick={() => setError(null)} />
            <span className="text-sm font-medium">{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-destructive/80 hover:text-destructive">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

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
                Clear
              </button>
              <button
                type="submit"
                form="story-form"
                disabled={isLoading || isFetchingDetails}
                className={`${primaryButtonClass} group`}
              >
                {isLoading || isFetchingDetails ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {isFetchingDetails ? 'Loading the library…' : 'Writing the story…'}
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Generate story
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
                  Kind of episode
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
                    New story
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
                    Continues an earlier episode
                  </button>
                </div>
              </div>

              <div className="text-xs text-muted-foreground bg-muted/30 px-3 py-2 rounded-lg border border-border/20 max-w-xs">
                {generationType === 'new'
                  ? 'A standalone story.'
                  : 'Picks up the plot and characters from an earlier episode.'}
              </div>
            </div>

            {/* Continuation Episode Options */}
            {generationType === 'continue' && (
              <div className="p-4 rounded-xl border space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className={labelClass}>
                      Earlier episode (optional)
                    </label>
                    <div className="relative">
                      <select
                        value={previousEpisodeId}
                        onChange={(e) => handlePreviousEpisodeChange(e.target.value)}
                        className={selectFieldClass}
                      >
                        <option value="">Choose an episode</option>
                        {stories.map((story) => (
                          <option key={story.id} value={story.id}>
                            {episodeTitle(story)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className={labelClass}>
                      What happened before
                    </label>
                    <textarea
                      value={previousContext}
                      onChange={(e) => setPreviousContext(e.target.value)}
                      rows={2}
                      className={fieldClass}
                      placeholder="What happened in the earlier episode that this one continues from"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Time Duration Input */}
            <div className="space-y-2">
              <label className={labelClass}>
                Target length
              </label>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <input
                    type="text"
                    name="Duration"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    className={fieldClass}
                    placeholder="For example 2-3 minutes"
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
                Concept
              </label>
              <textarea
                name="Concept"
                value={data.Concept}
                onChange={handleChange}
                rows={3}
                className={fieldClass}
                placeholder="The core idea of the story"
              />
            </div>

            <div className="space-y-2">
              <label className={labelClass}>
                Overview
              </label>
              <textarea
                name="Overview"
                value={data.Overview}
                onChange={handleChange}
                rows={4}
                className={fieldClass}
                placeholder="Key events, in order"
              />
            </div>

            <div className="space-y-2">
              <label className={labelClass}>
                Lesson
              </label>
              <textarea
                name="Lesson"
                value={data.Lesson}
                onChange={handleChange}
                rows={3}
                className={fieldClass}
                placeholder="What the episode teaches, for example sharing or honesty"
              />
            </div>
          </form>
        </GlassPanel>

      {/* Review newly suggested characters and locations before saving. */}
      {showReviewModal && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="max-w-lg w-full bg-card border border-border rounded-2xl p-6 shadow-2xl space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
                  <Users className="w-5 h-5 text-primary" />
                  New characters or locations
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  The story introduced characters or locations that are not in your libraries yet. Add the ones you want to keep.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowReviewModal(false)}
                disabled={isLoading || isAcceptingAll}
                className="text-muted-foreground hover:text-foreground p-1 disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
              {pendingCharacters.length > 0 && <section className="space-y-3">
                <h4 className="text-sm font-semibold text-foreground">New characters from the story</h4>
                {pendingCharacters.map((char, idx) => (
                  <div key={`${char.name}-${idx}`} className="p-4 rounded-xl border border-border bg-muted/30 space-y-3">
                    <div>
                      <h4 className="font-bold text-foreground text-sm">{char.name}</h4>
                      {char.description && <p className="text-xs text-muted-foreground mt-0.5">{char.description}</p>}
                    </div>
                    {char.added ? <span className="text-xs text-success font-semibold flex items-center gap-1"><Check className="w-4 h-4" /> Accepted — reference generates when saved</span> : char.rejected ? <span className="text-xs text-muted-foreground">Rejected (Will not be saved)</span> : (
                      <div className="flex items-center gap-2">
                        <button type="button" disabled={isSavingCharacter !== null || isLoading || isAcceptingAll} onClick={() => handleAddCharacterToDb(char, idx)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50">
                          {isSavingCharacter === char.name ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Add Character
                        </button>
                        <button type="button" disabled={isLoading || isAcceptingAll} onClick={() => handleRejectCharacter(idx)} className="px-3 py-1.5 rounded-lg bg-muted text-muted-foreground text-xs font-medium disabled:opacity-50">Reject</button>
                      </div>
                    )}
                  </div>
                ))}
              </section>}

              {pendingLocations.length > 0 && <h4 className="text-sm font-semibold text-foreground border-t border-border pt-4">New locations from the story</h4>}
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
                      <span className="text-xs text-success font-semibold flex items-center gap-1">
                        <Check className="w-4 h-4" /> Accepted — reference generates when saved
                      </span>
                    ) : loc.rejected ? (
                      <span className="text-xs text-muted-foreground font-medium italic">
                        Rejected (Will not be saved)
                      </span>
                    ) : (
                      <>
                        <button
                          type="button"
                          disabled={isSavingLocation === loc.name || isLoading || isAcceptingAll}
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
                          disabled={isLoading || isAcceptingAll}
                          onClick={() => handleRejectLocation(idx)}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-muted hover:bg-muted/80 text-muted-foreground text-xs font-medium transition cursor-pointer disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {savePhase && (
              <p className="text-sm text-primary font-medium flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                {savePhase === 'references' ? 'Generating accepted references…' : 'Saving story…'}
              </p>
            )}
            {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
            <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
              <button
                type="button"
                onClick={() => finalizeSaveStory(pendingStoryText)}
                disabled={isLoading || isAcceptingAll}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-primary/30 bg-primary/10 text-primary text-sm font-semibold hover:bg-primary/20 transition disabled:opacity-50 cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {savePhase === 'references' ? 'Generating References…' : 'Saving Story…'}
                  </>
                ) : (
                  <>
                    <span>Save accepted and continue</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
              {(pendingCharacters.some((item) => !item.added && !item.rejected) || pendingLocations.some((item) => !item.added && !item.rejected)) && (
                <button
                  type="button"
                  onClick={handleAcceptAll}
                  disabled={isLoading || isAcceptingAll}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition disabled:opacity-50 cursor-pointer"
                >
                  {isAcceptingAll ? <><Loader2 className="w-4 h-4 animate-spin" />{savePhase === 'references' ? 'Generating References…' : 'Adding All…'}</> : <><Check className="w-4 h-4" />Add all and save</>}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
