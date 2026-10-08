'use client';

import { AlertTriangle, Loader2, Sparkles } from "lucide-react";
import { StepStart } from "@/components/episode/StepStart";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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

export function ScriptGenerator({ storyId: episodeStoryId }: { storyId: string }) {
  const router = useRouter();

  const [stories, setStories] = useState<any[]>([]);
  const [selectedStoryId, setSelectedStoryId] = useState<string>('');
  const [selectedStory, setSelectedStory] = useState<any | null>(null);
  const [storyCharacters, setStoryCharacters] = useState<any[]>([]);
  const [storyLocations, setStoryLocations] = useState<any[]>([]);
  const [isFetchingStories, setIsFetchingStories] = useState<boolean>(true);
  const [isDetailsLoading, setIsDetailsLoading] = useState<boolean>(false);
  const [isGeneratingScript, setIsGeneratingScript] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStories();
  }, []);

  const fetchStories = async () => {
    setIsFetchingStories(true);
    try {
      const res = await getStoriesAction();
      if (res.success && res.stories) {
        setStories(res.stories);
        // The episode decides the story; there is nothing to pick.
        await handleStorySelect(episodeStoryId, res.stories);
      } else if (res.error) {
        setError(res.error);
      }
    } catch (e: any) {
      console.error("Failed to load stories from DB", e);
      setError(e?.message || "The story could not be loaded. Reload the page and try again.");
    } finally {
      setIsFetchingStories(false);
    }
  };

  // A declaration, so loading the stories above can call it.
  async function handleStorySelect(storyId: string, pool: any[] = stories) {
    setSelectedStoryId(storyId);
    const story = pool.find((s) => s.id === storyId) || null;
    setSelectedStory(story);

    if (story) {
      setIsDetailsLoading(true);
      try {
        const detailsRes = await getStoryCharactersAndLocationsAction(storyId);
        if (detailsRes.success) {
          setStoryCharacters(detailsRes.characters || []);
          setStoryLocations(detailsRes.locations || []);
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
      setStoryCharacters([]);
      setStoryLocations([]);
    }
  };

  const handleGenerateScript = async () => {
    if (!selectedStory) {
      setError("The story is still loading. Try again in a moment.");
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

**[EMOTION]** State the primary emotional tone (e.g. Excited, Normal, Emotional, Fearful, Curious).

**[WPM]** Target speech rate in Words Per Minute (e.g. 132 WPM for Excited, 126 WPM for Normal, 105 WPM for Emotional).

**[ACTION]** What happens in this beat.

**[DIALOGUE]** Spoken dialogue, if any. Format as CharacterName: "Spoken line". When multiple dialogue lines or sentences occur, use explicit pause tags between lines (e.g. Character: "Line one" <-Break 1.5 seconds-> "Line two"). If there is no dialogue, omit this tag.

**[CAMERA]** One shot: shot size, angle, and one camera move with a speed word (e.g. Medium shot, eye level, slow push-in.).

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

## EMOTION & WPM PACING GUIDELINES

All speech is unhurried: about 2 to 2.2 words per second. WPM never goes above 132. Excitement comes from performance, expression, and cutting to a new shot, never from faster speech.

Choose the **EMOTION** and **WPM** for each beat based on the narrative context:

1. **Excited / Energetic / Panicked** (Target WPM: 126 – 132 WPM, Default: 132 WPM)
   - Use for high-energy moments, big discoveries, joyful celebration, shouting, or frantic activity.

2. **Normal / Neutral / Conversational** (Target WPM: 120 – 130 WPM, Default: 126 WPM)
   - Use for standard dialogue, casual banter, explanations, or steady narration.

3. **Emotional / Slow / Dramatic** (Target WPM: 95 – 120 WPM, Default: 105 WPM)
   - Use for sad, gentle, intimate, or serious moments, dramatic revelations, bedtime/calm scenes, or long pauses.

---

## DIALOGUE PAUSE BREAKS GUIDELINES

To improve audio quality and TTS delivery:
- Specifically insert <-Break x seconds-> between consecutive dialogue lines, character exchanges, or separate sentences within a beat.
- Examples:
  - Jaksh: "Threshold number seven complete," <-Break 1.5 seconds-> "Jaksh? Where are you hiding?"
  - Jaksh: "Faster, faster!" <-Break 1 second-> Mom: "Hold on tight!" <-Break 1.5 seconds->
- Choose appropriate break durations (e.g. <-Break 0.5 seconds-> for short pauses, <-Break 1.5 seconds-> for speaker turns, <-Break 2.5 seconds-> for dramatic beats).
- Every break counts toward its beat's 8-second clip (see BEAT RULES 1). If the words plus the breaks do not fit, move the next sentence or the next speaker's reply into the following beat instead of shortening the break.

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

Each beat becomes ONE camera shot and ONE short video clip of 4 to 8 seconds.

Aim for at most about 14 spoken words in a beat, or about 10 when the beat contains a <-Break-> tag, so its speech fits an 8-second clip at an unhurried pace.

When a line or an exchange is longer, continue it in the next beat: split at a sentence or clause boundary, and give each beat its own framing. Every spoken word must still appear exactly once and in order; continuing a line in the next beat is the only way to shorten a beat. Never drop, shorten, or reword a line to meet this target. An over-long beat is acceptable; a missing word is not.

2. Preserve the original story.

Do not change the plot, character motivations, lesson, setting, or ending.

Do not invent new events that are not supported by the story.

3. Preserve dialogue.

Preserve ALL original spoken dialogue word-for-word, with the original speaker and order. Do not shorten, paraphrase, omit, duplicate, or invent spoken lines. Pause tags may be inserted without changing the spoken words.

Do not turn descriptive narrative or the Episode Recap into additional dialogue. The Episode Recap is metadata, not an additional scene or a repeat of the story's events.

4. Make every beat visually actionable.

The beat should describe things that can actually be shown or animated.

Avoid abstract descriptions unless they can be represented visually.

5. ACTION describes WHAT happens.

Do not put camera directions, sound effects, or animation instructions inside ACTION.

6. CAMERA describes HOW the beat is filmed, as exactly one shot.

Write it as: shot size, angle, one camera move with a speed word. Example: "Medium shot, eye level, slow push-in."

Use only this vocabulary:
- Shot size: wide shot, medium wide shot, medium shot, medium close-up, close-up, extreme close-up
- Angle: eye level, low angle, high angle, over-the-shoulder, POV, child-eye height
- Camera move: static (locked-off), push-in, pull-back, pan left, pan right, tilt up, tilt down, tracking shot, orbit, crane up, crane down
- Speed: slow, smooth, gentle, gradual. Never "fast", "quick", or "whip".

One primary camera move per beat; two combined moves is the maximum. Never cut inside a beat: no "then cutting to" and no second framing. If the moment needs a second framing, it is a second beat.

Change the shot size or the camera move from one beat to the next (for example wide shot, then medium shot, then close-up as the emotion rises). Two beats in a row with the same shot size and the same move make the episode feel flat.

Never use loose phrases such as "camera looks at" or "camera captures". Camera movement belongs only in CAMERA; subject movement belongs only in MOTION.

7. MOTION describes PHYSICAL MOVEMENT.

Describe character movement, environmental movement, transformations, or important visual changes.

Do not repeat the ACTION word-for-word.

8. SFX describes SOUND EFFECTS only.

Do not describe music unless specifically required by the story.

9. Maintain character consistency and strict character fidelity.

Use the exact character names from the story.

Do not introduce new characters unless they already exist in the story.

STRICT CHARACTER FIDELITY & NO FABRICATION RULE (CRITICAL):
- NEVER INVENT, ASSUME, OR FABRICATE any physical traits, body mechanics, technological qualities (such as wheels, robot parts, metal chassis, engines, camera eyes, or gadgets), powers, or unstated equipment for any character.
- DO NOT describe any character as a robot, machine, mechanical companion, or as having wheels, engines, metallic parts, glowing eyes, or spinning compasses UNLESS those exact traits are explicitly stated in their official character profile or story.
- For example: If a character is named "Tilli", describe Tilli strictly as defined in the official character profile or story. DO NOT add "on wheels", "robot", "mechanical companion", or any unmentioned fantasy/scifi traits.
- Keep all character actions and motion 100% faithful to their official character profiles.

${storyCharacters.length > 0 ? `OFFICIAL CHARACTER PROFILES FOR THIS STORY:
${storyCharacters.map((c: any) => `- ${c.name}: ${c.description || 'Standard character'}`).join("\n")}

` : ""}10. Maintain environmental continuity.

If the story moves from one location to another, make the transition logical.

Keep the time of day and environment consistent between consecutive beats unless the story explicitly changes them.

${storyLocations.length > 0 ? `STRICT LOCATION CONSTRAINTS:
The story has these exact linked locations:
${storyLocations.map((l: any) => `- "${l.name}"`).join("\n")}

You MUST strictly use these location names in your beat location headers (e.g. INT. ${storyLocations[0]?.name || "LOCATION"} - DAY).` : ""}

11. Keep beats concise.

Each beat should contain enough detail for a storyboard or video-generation system, but should not become a paragraph of prose.

12. Do not add explanations outside the beat script.

Return ONLY the completed beat script.

---

## NATURAL PACING & MODEST RUNTIME FLEXIBILITY

- Adapt the existing story compactly without expanding its scope. If an episode duration is explicitly supplied in the source, use it as a target with modest flexibility, not a reason to alter dialogue. Do not invent a fixed episode duration when none is supplied.
- Preserve every original dialogue word and all essential story events. Natural, complete delivery takes priority over forcing an exact episode runtime; a small runtime overrun is acceptable. Do not return a runtime warning or interrupt generation solely because of that overrun.
- Never increase WPM to fit a duration, rush speech, cut off words or final syllables, remove necessary pauses, or shorten dialogue. Choose WPM for the emotional context, not to squeeze content into a clip.
- Do not add extra conversations, redundant establishing moments, repeated reactions, unnecessary camera movements, or prolonged silent holds that are not needed to communicate the original story.
- Keep meaningful physical changes as distinct beats, but do not create additional standalone beats for incidental gestures or reactions that naturally accompany an existing action or dialogue.
- Let compatible movement, expressions, and camera framing happen during speech or its pauses. Describe that overlap in MOTION. Do not overlap speakers or force unrelated sequential actions to happen simultaneously.
- Review the full adaptation before returning: all original dialogue is intact, the ending is complete, and unnecessary expansion has been removed. Keep this review internal and return only the beat script.
- Episode-level runtime flexibility does not increase downstream per-video duration limits. Do not instruct downstream generation to squeeze overlong content into a single clip.

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
        story_id: selectedStory.id,
        topic: selectedStory.topic || selectedStory.concept || "Beat Script",
        generationType: selectedStory.generation_type || "new",
        contentHtml: generatedScriptText
      });

      if (saveRes.success && saveRes.data?.id) {
        router.refresh();
      } else {
        setError(saveRes.error || "The script was written but could not be saved. Try again.");
      }
    } catch (err: any) {
      console.error("Error generating script:", err);
      setError(err?.message || "An error occurred while generating the script.");
    } finally {
      setIsGeneratingScript(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>The script was not written</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <StepStart
        title="Write the beat script"
        description="Turns this episode's story into numbered beats. Each beat is one shot with its action, dialogue, camera and motion, and becomes one storyboard panel and one video clip."
        action={
          <Button onClick={handleGenerateScript} disabled={isGeneratingScript || !selectedStory || isDetailsLoading}>
            {isGeneratingScript ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {isGeneratingScript ? "Writing the script…" : "Generate script"}
          </Button>
        }
        note={
          isGeneratingScript
            ? "This usually takes one to three minutes. Keep this tab open."
            : isFetchingStories || isDetailsLoading
            ? "Loading the story and its cast…"
            : undefined
        }
      />
    </div>
  );
}
