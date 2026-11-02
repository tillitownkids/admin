import { MAX_BEATS_PER_SCENE, STORYBOARD_PANELS } from '@/lib/storyboardGeneration';
import { SCENE_MAX_SECONDS, SCENE_MIN_SECONDS } from '@/lib/sceneTiming';
import { SHOT_CAP_SECONDS, SHOT_DURATIONS } from '@/lib/sceneShots';
import { MAX_SCENE_OBJECTS } from '@/lib/propSheet';

// The rules Claude follows when it writes an episode through the MCP server. They are the same
// rules the admin's own generation prompts enforce, so what Claude saves passes through the
// Storyboard and Video steps unchanged.

export const SERVER_INSTRUCTIONS = `TilliTown Admin is the production tool and the place of record for "Tilli & Jaksh", a 3D animated children's series. An episode goes Story → Assets → Script → Sequences → Publish. A sequence is one 2x2 storyboard and one clip, holding up to 4 beats.

Before writing any story, script, storyboard prompt or video direction, call get_production_guide once and follow it exactly: the admin parses the saved text, so the format matters.

Typical flow: list_episodes or get_episode to see where things stand; list_library for exact character, location and object names; create_episode (or update_story); save_script; save_storyboard (the sequences); save_video_plan per sequence. Then review: get_sequence shows one sequence's prompts, takes, issues and history; add_sequence_note records a problem seen in a storyboard or clip; update_sequence or save_video_plan fixes it; resolve_sequence_note closes it; restore_prompt_version undoes a change. Storyboards and clips made with the Magnific connector are saved with record_storyboard_take / record_clip_take (pass the Magnific identifier). Character and location looks come from reference sheets, never from prompt text.

Writes go to the production database. Show the user what you will save and get a yes before replacing an existing script or the sequences, and before spending generation credits.`;

const CAMERA_VOCABULARY = `- Shot size: wide shot, medium wide shot, medium shot, medium close-up, close-up, extreme close-up
- Angle: eye level, low angle, high angle, over-the-shoulder, POV, child-eye height
- Camera move: static (locked-off), push-in, pull-back, pan left, pan right, tilt up, tilt down, tracking shot, orbit, crane up, crane down
- Speed: slow, smooth, gentle, gradual. Never "fast", "quick" or "whip".`;

export function productionGuide(settings: { targetAudience?: string; tone?: string }): string {
  const audience = settings.targetAudience?.trim() || 'children aged 3 to 6';
  const tone = settings.tone?.trim() || 'warm, gentle, curious';

  return `# TilliTown production guide

Audience: ${audience}. Tone: ${tone}.
Use characters, locations and objects by their EXACT library names (list_library). Never describe a character's or location's looks in a prompt: their reference sheets define them.

Locked series facts (state them where a prompt places these characters together):
- Tilli's height reaches Jaksh's shoulder.

## 1. Story (create_episode / update_story)

Markdown. The first line is the title as "# Title". Then prose with dialogue in quotes, attributed to named characters. Keep it to what can be animated: concrete actions, a clear lesson, a complete ending. Link every character, location and object the story uses; anything new must be added to the library first (create_library_item).

## 2. Beat script (save_script)

Markdown. One block per beat, numbered from 1 with no gaps, separated by "---":

### BEAT 1 — Short beat title
EXT — LOCATION NAME — TIME OF DAY — one line on the environment

**[EMOTION]** Curious
**[WPM]** 126 WPM
**[ACTION]** What happens in this beat.
**[DIALOGUE]** Jaksh: "First line." <-Break 1 second-> Tilli: "Reply."
**[CAMERA]** Medium shot, eye level, slow push-in.
**[MOTION]** Physical movement and visual change during the beat.
**[SFX]** Sound effects only.
**[DURATION]** 5 seconds

Rules:
- ONE BEAT = ONE PHYSICAL IDEA = one camera shot = one storyboard panel. Split compound actions into several beats.
- The location header uses the exact linked location name. INT for indoors, EXT for outdoors. Keep time of day consistent until the story changes it.
- Speech is unhurried, about 2 words per second. WPM: 132 excited, 126 normal, 105 emotional; never above 132.
- At most about 14 spoken words per beat (about 10 when the beat has a <-Break-> tag). Continue a longer line in the next beat; never drop or reword dialogue to fit. Omit [DIALOGUE] for a silent beat.
- Pause tags look exactly like <-Break 1.5 seconds->: 0.5 s short pause, 1.5 s speaker turn, 2.5 s dramatic.
- [CAMERA] is one shot: shot size, angle, one move with a speed word, from this vocabulary only:
${CAMERA_VOCABULARY}
  No "then", no cuts inside a beat. Change shot size or move from one beat to the next.
- [ACTION] says what happens (no camera words); [MOTION] says how bodies and things move; [SFX] is sound only.
- [DURATION] is the clip length the beat needs on screen, one of ${SHOT_DURATIONS.filter((s) => s <= SHOT_CAP_SECONDS).join(', ')} seconds (never over ${SHOT_CAP_SECONDS} unless the dialogue itself needs it). It can lengthen a beat but never shortens what the dialogue needs. A glance is 2–3 s of action, a gesture 3–4, a short task 4–6.
- Never invent traits for a character (no robot parts, wheels, glowing eyes) unless their library description says so.

## 3. Sequences and storyboards (save_storyboard)

Group consecutive beats into sequences. Each sequence is one storyboard image (a 2x2 grid of ${STORYBOARD_PANELS} panels) and one clip.
- Every beat belongs to exactly one sequence, in order, none skipped.
- At most ${MAX_BEATS_PER_SCENE} beats per sequence. Panel N = the sequence's Nth beat.
- A sequence runs ${SCENE_MIN_SECONDS} to ${SCENE_MAX_SECONDS} seconds (sum of its beats' durations). End sequences where the story moment ends; do not make them equal.
- One location and one time of day per sequence. Start a new sequence at every change of location, INT/EXT or time of day.
- character_names: only the cast physically on screen in the sequence, exact names. object_names: at most ${MAX_SCENE_OBJECTS} episode objects clearly visible, exact names.
- Name whose hand, boot or face a close-up shows; never an anonymous "a boot lands on sand".
- You do not copy beat text: the server takes each sequence's beats from the saved script.

storyboard_prompt template (under 300 words, plain, no decorative adjectives):

Full-color 3D CGI animation frame, Disney Pixar and DreamWorks feature film quality, Octane 3D render, smooth digital CGI models, cinematic volumetric lighting, zero line art.

Create a single 4-panel 3D animation panel grid for a full-color 3D animated children's film, arranged in a 2x2 grid, landscape 16:9 per panel, one panel per camera shot.

Characters: Jaksh, Tilli. Each appears as exactly one individual, matching the attached reference images.
(Objects: Name. Each matches its attached object sheet exactly.)   ← only when the scene has objects

Setting: [location name, then at most 20 words matching the location reference]

All panels: [time of day and one lighting phrase, at most 15 words]

Panel 1: [Shot size, angle] — Jaksh (left, foreground, kneeling, facing right) [what he is doing]
Panel 2: ...
Panel 3: ...
Panel 4: ...

Keep the characters and the location visually identical across all panels and matching the attached reference images — same faces, same proportions. Clean 3D CGI render in every panel. Label each panel with a small number in its corner.

Panel rules:
- Start with the shot size and angle from the beat's CAMERA line, then an em dash, then every character in frame by exact name with (side of frame, depth, pose, facing), then the one thing they do. One sentence, at most 40 words, a still frame (no movement, no "then").
- Keep characters apart and on the same side of frame across panels unless the action moves them.
- A sequence with fewer than 4 beats fills its spare panels with alternate framings or detail inserts of its own beats, each starting "(spare)".
- Never use "hand-drawn", "sketch", "line art", "drawing" or "illustration". Never describe looks; the Characters line is the only place characters are listed.

## 4. Video shot directions (save_video_plan)

One call per sequence. Give the sequence's lighting (one phrase, at most 14 words, time of day plus one light quality) and one shot per beat, in beat order:
- camera: "Medium shot, eye level, slow push-in." — from the vocabulary above, one move, consecutive shots differ in size or move. Keep the beat's own opening framing.
- action: ONE sentence, at most 25 words, the single visible physical action, exact names, no camera words, no dialogue, no looks.
- placement: every character in the shot at its first frame, "Name: left/center/right, foreground/midground/background, pose, facing ..." separated by semicolons; copy positions from the storyboard panel. "none" if nobody is in shot.
Dialogue is inserted word for word by the server from the script, with timing. The server builds the final timestamped clip prompt; read it back from the result.

## 5. Review loop

When the user shows a storyboard or clip with a problem: add_sequence_note (kind issue, what is wrong and in which beat), fix the cause with update_sequence or save_video_plan, tell the user what changed, and resolve_sequence_note once a new take is good. Every change is kept in the sequence's history.`;
}
