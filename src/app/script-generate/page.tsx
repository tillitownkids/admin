'use client';

import { 
  Bot, 
  ChevronDown, 
  X, 
  ArrowLeft, 
  BookOpen, 
  Clock, 
  Plus, 
  Users, 
  User, 
  MapPin, 
  Loader2, 
  ExternalLink,
  Sparkles,
  ArrowRight 
} from "lucide-react";
import { ScriptEditor } from "@/components/script/ScriptEditor";
import { ScriptContent } from "@/types/script";
import { PageHeader } from "@/components/PageHeader";
import { GlassPanel } from "@/components/GlassPanel";
import { labelClass, selectFieldClass, primaryButtonClass } from "@/lib/styles";
import { getStoriesAction, getStoryCharactersAndLocationsAction } from "@/actions/saveStoryAction";
import { saveGeneratedScriptAction } from "@/actions/saveScriptAction";
import { callAi } from "@/actions/actions";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export interface ScriptHistory {
  id: string;
  topic: string;
  mode: 'single' | 'multi';
  content?: any;
  generated_at: string;
}

function cleanMarkdownTitle(str: string): string {
  return str
    .replace(/^#+\s*/, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/<u>(.*?)<\/u>/gi, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .trim();
}

function formatTextToHtml(text: string): string {
  if (!text) return '';

  let cleaned = text.trim();
  if (cleaned.startsWith('```html')) cleaned = cleaned.slice(7);
  else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
  if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
  cleaned = cleaned.trim();

  if (/^<(p|h1|h2|h3|div|ul|ol)\b/i.test(cleaned)) {
    return cleaned;
  }

  const lines = cleaned.split('\n');
  let html = '';
  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line) {
      if (inList) {
        html += '</ul>';
        inList = false;
      }
      continue;
    }

    if (line.startsWith('# ')) {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<h1 class="text-xl font-bold mt-4 mb-2 text-foreground"><strong>${cleanMarkdownTitle(line)}</strong></h1>`;
    } else if (line.startsWith('## ')) {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<h2 class="text-lg font-bold mt-3 mb-2 text-foreground"><strong>${cleanMarkdownTitle(line)}</strong></h2>`;
    } else if (line.startsWith('### ')) {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<h3 class="text-base font-bold text-foreground mt-4 mb-2"><strong>${cleanMarkdownTitle(line)}</strong></h3>`;
    } else if (line.startsWith('• ') || line.startsWith('- ') || line.startsWith('* ')) {
      if (!inList) {
        html += '<ul class="list-disc ml-5 space-y-1 mb-3 text-foreground/90">';
        inList = true;
      }
      let listContent = line.replace(/^[•\-\*]\s*/, '').trim();
      listContent = listContent
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/<u>(.*?)<\/u>/gi, '<u>$1</u>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>');
      html += `<li>${listContent}</li>`;
    } else {
      if (inList) { html += '</ul>'; inList = false; }
      let paragraphContent = line
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/<u>(.*?)<\/u>/gi, '<u>$1</u>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>');
      html += `<p class="mb-3 leading-relaxed text-foreground/90">${paragraphContent}</p>`;
    }
  }

  if (inList) {
    html += '</ul>';
  }

  return html;
}

export default function ScriptGeneratePage() {
  const router = useRouter();

  const [viewMode, setViewMode] = useState<'create' | 'history' | 'edit'>('history');
  const [stories, setStories] = useState<any[]>([]);
  const [selectedStoryId, setSelectedStoryId] = useState<string>('');
  const [selectedStory, setSelectedStory] = useState<any | null>(null);
  const [storyCharacters, setStoryCharacters] = useState<any[]>([]);
  const [storyLocations, setStoryLocations] = useState<any[]>([]);
  const [isFetchingStories, setIsFetchingStories] = useState<boolean>(true);
  const [isDetailsLoading, setIsDetailsLoading] = useState<boolean>(false);
  const [isGeneratingScript, setIsGeneratingScript] = useState<boolean>(false);
  const [history, setHistory] = useState<ScriptHistory[]>([]);
  const [scriptContent, setScriptContent] = useState<ScriptContent>({ recap: '', scenes: [] });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStories();
    fetchHistory();
  }, []);

  const fetchStories = async () => {
    setIsFetchingStories(true);
    try {
      const res = await getStoriesAction();
      if (res.success && res.stories) {
        setStories(res.stories);
      } else if (res.error) {
        setError(res.error);
      }
    } catch (e: any) {
      console.error("Failed to load stories from DB", e);
      setError(e?.message || "Failed to load stories from database");
    } finally {
      setIsFetchingStories(false);
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await fetch('/api/scripts');
      if (res.ok) {
        const data = await res.json();
        setHistory(data.scripts || []);
      }
    } catch (e) {
      console.error("Failed to load history from DB", e);
    }
  };

  const handleStorySelect = async (storyId: string) => {
    setSelectedStoryId(storyId);
    const story = stories.find((s) => s.id === storyId) || null;
    setSelectedStory(story);

    if (story) {
      console.log("Selected Story Data:", story);
      setIsDetailsLoading(true);
      try {
        const detailsRes = await getStoryCharactersAndLocationsAction(storyId);
        if (detailsRes.success) {
          setStoryCharacters(detailsRes.characters || []);
          setStoryLocations(detailsRes.locations || []);
          console.log("Fetched Story Characters:", detailsRes.characters);
          console.log("Fetched Episode Locations:", detailsRes.locations);
        } else {
          setStoryCharacters([]);
          setStoryLocations([]);
        }
      } catch (err) {
        console.error("Error fetching story characters and locations:", err);
        setStoryCharacters([]);
        setStoryLocations([]);
      } finally {
        setIsDetailsLoading(false);
      }
    } else {
      console.log("No story selected");
      setStoryCharacters([]);
      setStoryLocations([]);
    }
  };

  const handleGenerateScript = async () => {
    if (!selectedStory) {
      setError("Please select a story from the database before generating a script.");
      setTimeout(() => setError(null), 5000);
      return;
    }

    setIsGeneratingScript(true);
    setError(null);

    const storyContentText = selectedStory.content || selectedStory.overview || selectedStory.concept || '';

    const prompt = `You are a professional storyboard and animation script writer for a children's animated series.

Your task is to convert the provided narrative story into a structured beat script for an animation/storyboard pipeline.

STORY:
${storyContentText}

---

## OUTPUT FORMAT

Break the story into sequential beats.

For every beat, use exactly this structure:

### BEAT N — [Short descriptive beat title]

[LOCATION HEADER]

**[ACTION]** What happens in this beat.

**[DIALOGUE]** Spoken dialogue, if any. If there is no dialogue, omit this tag.

**[CAMERA]** Describe the camera shot, framing, movement, and angle.

**[MOTION]** Describe the important physical movements or visual changes that occur during the beat.

**[SFX]** Describe relevant sound effects.

---

## LOCATION HEADER FORMAT

Every beat must begin with a location header:

EXT/INT — LOCATION — TIME OF DAY — brief environmental description

Use:
- EXT for exterior/outdoor scenes.
- INT for interior/indoor scenes.

Examples:
EXT — DUBAI CREEK — GOLDEN HOUR — Boats move gently across the water as the city glows in the setting sun.

INT — OLD HOUSE — EVENING — Warm lantern light fills the room.

---

## BEAT RULES

1. ONE BEAT = ONE PHYSICAL IDEA.

A beat should represent one clear physical action or state change.

If a moment contains multiple meaningful physical changes, split it into separate beats.

Bad:
"Jaksh runs to the window, looks outside, sees the desert, and calls Tilli."

Better:
- Beat 1: Jaksh runs to the window.
- Beat 2: Jaksh looks through the window and sees the desert.
- Beat 3: Jaksh calls Tilli.

2. Preserve the original story.

Do not change the plot, character motivations, lesson, setting, or ending.

Do not invent new events that are not supported by the story.

3. Preserve dialogue.

Keep important dialogue from the original story as closely as possible.

Do not unnecessarily rewrite dialogue.

4. Make every beat visually actionable.

The beat should describe things that can actually be shown or animated.

Avoid abstract descriptions unless they can be represented visually.

5. ACTION describes WHAT happens.

Do not put camera directions, sound effects, or animation instructions inside ACTION.

6. CAMERA describes HOW the scene is filmed.

Include useful information such as:
- wide shot
- close-up
- medium shot
- over-the-shoulder
- tracking shot
- crane shot
- pan
- tilt
- push-in
- pull-back
- orbit
- low angle
- high angle

Do not use unnecessary camera movements. Choose the camera direction that best communicates the beat.

7. MOTION describes PHYSICAL MOVEMENT.

Describe character movement, environmental movement, transformations, or important visual changes.

Do not repeat the ACTION word-for-word.

8. SFX describes SOUND EFFECTS only.

Do not describe music unless specifically required by the story.

9. Maintain character consistency.

Use the exact character names from the story.

Do not introduce new characters unless they already exist in the story.

10. Maintain environmental continuity.

If the story moves from one location to another, make the transition logical.

Keep the time of day and environment consistent between consecutive beats unless the story explicitly changes them.

11. Keep beats concise.

Each beat should contain enough detail for a storyboard or video-generation system, but should not become a paragraph of prose.

12. Do not add explanations outside the beat script.

Return ONLY the completed beat script.

---

## IMPORTANT

The output will be used by a downstream storyboard/image/video generation system.

Therefore:
- Be visually specific.
- Keep each beat independently understandable.
- Avoid vague phrases such as "something magical happens."
- Describe what the characters and environment actually do.
- Do not combine multiple physical actions into one beat.
- Do not omit important visual events from the original story.

Now convert the provided story into the beat script format.`;

    try {
      const response = await callAi(prompt);
      const generatedScriptText = typeof response === "string" ? response : response?.text;

      if (!generatedScriptText) {
        throw new Error("No script content was returned from AI.");
      }

      const saveRes = await saveGeneratedScriptAction({
        topic: selectedStory.topic || selectedStory.concept || "Beat Script",
        generationType: selectedStory.generation_type || "new",
        contentHtml: generatedScriptText
      });

      if (saveRes.success && saveRes.data?.id) {
        router.push(`/script-generate/${saveRes.data.id}`);
      } else {
        setError(saveRes.error || "Failed to save generated script to database.");
      }
    } catch (err: any) {
      console.error("Error generating script:", err);
      setError(err?.message || "An error occurred while generating the script.");
    } finally {
      setIsGeneratingScript(false);
    }
  };

  const loadHistoryRecord = (record: ScriptHistory) => {
    if (record.id) {
      router.push(`/script-generate/${record.id}`);
    } else {
      try {
        const parsed = typeof record.content === 'string' ? JSON.parse(record.content) : record.content;
        setScriptContent(parsed || { recap: record.topic || '', scenes: [] });
      } catch {
        setScriptContent({ recap: record.topic || '', scenes: [] });
      }
      setViewMode('edit');
    }
  };

  return (
    <div className="max-w-[1200px] w-full mx-auto space-y-6 page-enter pb-10">
      <PageHeader
        icon={Bot}
        title="Script"
        highlight="Generation"
        description="Select a story from the database to generate a structured script."
      />

      {error && (
        <div className="p-4 bg-destructive/10 text-destructive border border-destructive/20 rounded-lg flex items-center justify-between">
          <span className="text-sm font-medium">{error}</span>
          <button onClick={() => setError(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {viewMode === 'create' ? (
        <GlassPanel
          footer={
            <div className="flex w-full sm:w-auto items-center justify-end gap-3">
              <button
                type="button"
                onClick={handleGenerateScript}
                disabled={isGeneratingScript || !selectedStory}
                className={primaryButtonClass}
              >
                {isGeneratingScript ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-primary-foreground" />
                    Generating Script...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-emerald-500" />
                    Generate Script
                  </>
                )}
              </button>
            </div>
          }
        >
          <div className="space-y-6 p-2">
            {/* Story Dropdown Select */}
            <div className="space-y-3">
              <label className={labelClass}>
                <BookOpen className="w-4 h-4 text-primary" />
                Story
              </label>
              <div className="relative">
                <select
                  value={selectedStoryId}
                  onChange={(e) => handleStorySelect(e.target.value)}
                  className={selectFieldClass}
                  disabled={isFetchingStories || isGeneratingScript}
                >
                  <option value="">
                    {isFetchingStories ? "Loading stories from database..." : "Select a Story from Database"}
                  </option>
                  {stories.map((story) => (
                    <option key={story.id} value={story.id}>
                      {story.topic || story.concept || "Untitled Story"}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground" />
              </div>
            </div>

            {/* Selected Story Details inside the SAME outer box */}
            {selectedStory && (
              <div className="space-y-6 pt-4 border-t border-border/60 animate-in fade-in duration-300">
                {isDetailsLoading ? (
                  <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground text-sm">
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    Loading story characters and locations...
                  </div>
                ) : (
                  <>
                    {/* Characters Section */}
                    <div className="space-y-3">
                      <label className={labelClass}>
                        <Users className="w-4 h-4 text-primary" />
                        Story Characters
                      </label>
                      {storyCharacters.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                          {storyCharacters.map((char: any, i: number) => {
                            const hasImage = Boolean(char.reference_image_url);
                            return (
                              <div 
                                key={char.id || i}
                                onClick={() => {
                                  if (hasImage) {
                                    window.open(char.reference_image_url, '_blank', 'noopener,noreferrer');
                                  }
                                }}
                                className={`group p-3 rounded-xl bg-background/60 border border-border/60 flex items-center gap-3 transition-all ${
                                  hasImage 
                                    ? 'cursor-pointer hover:border-primary/60 hover:bg-background/80 hover:scale-[1.01] active:scale-[0.99]' 
                                    : 'hover:border-primary/40'
                                }`}
                                title={hasImage ? `Click to view ${char.name || 'character'} image in new tab` : undefined}
                              >
                                {hasImage ? (
                                  <img 
                                    src={char.reference_image_url} 
                                    alt={char.name || 'Character'} 
                                    className="w-10 h-10 rounded-full object-cover border border-primary/30 shrink-0 group-hover:border-primary transition-colors"
                                  />
                                ) : (
                                  <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                                    <User className="w-5 h-5" />
                                  </div>
                                )}
                                <div className="min-w-0 flex-1">
                                  <div className="font-semibold text-sm text-foreground truncate flex items-center justify-between gap-1">
                                    <span className="truncate">{char.name || 'Unnamed Character'}</span>
                                    {hasImage && (
                                      <ExternalLink className="w-3.5 h-3.5 text-muted-foreground opacity-60 group-hover:opacity-100 group-hover:text-primary shrink-0 transition-opacity" />
                                    )}
                                  </div>
                                  {char.description && (
                                    <div className="text-xs text-muted-foreground truncate">
                                      {char.description}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground italic px-1">
                          No characters linked to this story yet.
                        </p>
                      )}
                    </div>

                    {/* Locations Section */}
                    <div className="space-y-3">
                      <label className={labelClass}>
                        <MapPin className="w-4 h-4 text-emerald-500" />
                        Episode Locations
                      </label>
                      {storyLocations.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                          {storyLocations.map((loc: any, i: number) => {
                            const hasImage = Boolean(loc.reference_image_url);
                            return (
                              <div 
                                key={loc.id || i}
                                onClick={() => {
                                  if (hasImage) {
                                    window.open(loc.reference_image_url, '_blank', 'noopener,noreferrer');
                                  }
                                }}
                                className={`group p-3 rounded-xl bg-background/60 border border-border/60 flex items-center gap-3 transition-all ${
                                  hasImage 
                                    ? 'cursor-pointer hover:border-emerald-500/60 hover:bg-background/80 hover:scale-[1.01] active:scale-[0.99]' 
                                    : 'hover:border-emerald-500/40'
                                }`}
                                title={hasImage ? `Click to view ${loc.name || 'location'} image in new tab` : undefined}
                              >
                                {hasImage ? (
                                  <img 
                                    src={loc.reference_image_url} 
                                    alt={loc.name || 'Location'} 
                                    className="w-12 h-10 rounded-lg object-cover border border-emerald-500/30 shrink-0 group-hover:border-emerald-500 transition-colors"
                                  />
                                ) : (
                                  <div className="w-12 h-10 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
                                    <MapPin className="w-5 h-5" />
                                  </div>
                                )}
                                <div className="min-w-0 flex-1">
                                  <div className="font-semibold text-sm text-foreground truncate flex items-center justify-between gap-1">
                                    <span className="truncate">{loc.name || 'Unnamed Location'}</span>
                                    {hasImage && (
                                      <ExternalLink className="w-3.5 h-3.5 text-muted-foreground opacity-60 group-hover:opacity-100 group-hover:text-emerald-500 shrink-0 transition-opacity" />
                                    )}
                                  </div>
                                  {loc.description && (
                                    <div className="text-xs text-muted-foreground truncate">
                                      {loc.description}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground italic px-1">
                          No episode locations linked to this story yet.
                        </p>
                      )}
                    </div>
                  </>
                )}

                {/* Story Narrative Section */}
                {selectedStory.content && (
                  <div className="space-y-3 pt-4 border-t border-border/60">
                    <label className={labelClass}>
                      <BookOpen className="w-4 h-4 text-primary" />
                      Story Narrative
                    </label>
                    <div 
                      className="p-6 rounded-xl bg-background/60 border border-border/60 text-foreground leading-relaxed prose prose-neutral dark:prose-invert max-w-none text-base space-y-3"
                      dangerouslySetInnerHTML={{ __html: formatTextToHtml(selectedStory.content) }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </GlassPanel>
      ) : viewMode === 'history' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div
            onClick={() => {
              setSelectedStoryId('');
              setSelectedStory(null);
              setStoryCharacters([]);
              setStoryLocations([]);
              setViewMode('create');
            }}
            className="cursor-pointer flex flex-col items-center justify-center p-6 rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors min-h-[200px]"
          >
            <div className="w-12 h-12 rounded-full bg-primary/20 text-primary flex items-center justify-center mb-3">
              <Plus className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-lg text-primary">Create New Script</h3>
            <p className="text-sm text-muted-foreground mt-1 text-center">Generate a new structured script</p>
          </div>

          {history.map((record) => (
            <div
              key={record.id}
              onClick={() => loadHistoryRecord(record)}
              className="cursor-pointer flex flex-col p-5 rounded-2xl border border-border bg-card min-h-[200px]"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase bg-emerald-500/10 text-emerald-500">
                  {record.mode}
                </span>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {new Date(record.generated_at).toLocaleDateString()}
                </span>
              </div>
              <h3 className="text-xl font-bold text-foreground mb-3 line-clamp-3">
                {record.topic || "Untitled Script"}
              </h3>
              <div className="mt-auto pt-4 border-t border-border/50 text-sm font-medium text-primary flex items-center gap-1.5 group-hover:translate-x-0.5 transition-transform">
                Open in Editor <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <GlassPanel>
          <div className="space-y-3">
            <label className={labelClass}>Script Scene & Dialogue Editor</label>
            <ScriptEditor value={scriptContent} onChange={setScriptContent} />
          </div>
        </GlassPanel>
      )}
    </div>
  );
}
