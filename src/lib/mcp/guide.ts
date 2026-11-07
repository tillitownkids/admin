import { MAX_BEATS_PER_SCENE, STORYBOARD_PANELS } from '@/lib/storyboardGeneration';
import { SCENE_MAX_SECONDS, SCENE_MIN_SECONDS } from '@/lib/sceneTiming';
import { SHOT_CAP_SECONDS, SHOT_DURATIONS } from '@/lib/sceneShots';
import { MAX_SCENE_OBJECTS } from '@/lib/propSheet';

// The rules Claude follows when it writes an episode through the MCP server. They are the same
// rules the admin's own generation prompts enforce, so what Claude saves passes through the
// Storyboard and Video steps unchanged.

export const SERVER_INSTRUCTIONS = `TilliTown Admin is the production tool and the place of record for "Tilli & Jaksh", a 3D animated children's series. An episode goes Story → Assets → Script → Sequences → Publish. A sequence is one 2x2 storyboard and one clip, holding up to 4 beats.

Before writing any story, script, storyboard prompt or video direction, call get_production_guide once and follow it exactly: the admin parses the saved text, so the format matters.

Typical flow: list_episodes or get_episode to see where things stand; list_library for exact character, location and object names; create_episode (or update_story); save_script; save_storyboard (the sequences); set_attachments for each sequence's storyboard and clip (get_attachable_assets lists sheets, their versions and other storyboards); save_video_plan per sequence. Then review: get_sequence shows one sequence's prompts, takes, issues and history; add_sequence_note records a problem seen in a storyboard or clip; update_sequence or save_video_plan fixes it; resolve_sequence_note closes it; restore_prompt_version undoes a change. Storyboards and clips made with the Magnific connector are saved with record_storyboard_take / record_clip_take (pass the Magnific identifier). Character and location looks come from reference sheets, never from prompt text.

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

storyboard_prompt template (under 300 words, plain, no decorative adjectives). When the attachments are chosen with set_attachments, start with its prompt_line ("Attach 3 images in this order: (1) Jaksh sheet, ...") and name every image by number in the text ("Jaksh (Image 1)", "Setting matches Image 2's bottom-middle panel").

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

## 3b. Attachments (get_attachable_assets, set_attachments)

You choose each sequence's reference images, for its storyboard and for its clip, in order. Without a choice the admin attaches the sequence's cast, location and objects (and for a clip its own storyboard first). Rules learned on Episode 4:
- Only what the shot needs: the characters actually in frame, the one location sheet, at most ${MAX_SCENE_OBJECTS} objects. A sheet of someone not in the shot puts them in the shot.
- Pick the right version of a sheet: the night location sheet for night sequences, the golden-hour one for sunset (get_attachable_assets lists every version with version_id).
- Continuity: when a sequence carries straight on from the one before, attach ONE focused reference LAST (so the other image numbers stay put), never that sequence's whole storyboard — given the whole grid, the model copies the wrong panel, the grid or characters from other moments. Use a frame of the previous sequence's approved clip where this one picks up (Magnific video_extract_frames), or the matched panel cut out of its approved storyboard without its caption bar (Magnific images_crop). Add to the storyboard prompt: "CONTINUITY REFERENCE — Image N shows where Sequence P ends. Keep this place, its light and where each character stands, the same clothes and props. Do not copy its framing, borders or layout; draw only the new panels described below. If Image N and this text disagree, follow this text."
- Keep requests simple: attach only the sheets of what is in the frame (one location sheet, in the right version), name each image's role, and describe each panel as who, where (left / center / right) and the one thing they do. When an attempt fails, make the next request simpler, not longer.
- Never attach a sheet that is several pictures in a row (a power or effect sheet such as Scan & Explain) to a clip: the video copies the layout and splits the frame. Describe the effect in words instead.
- A clip's Image 1 is always its own storyboard. The storyboard must be a 2x2 grid: a two-panel (side by side) storyboard is twice as wide as the video and makes a split-screen clip.
- After set_attachments, write or update the prompt so it refers to the images by the numbers returned.

## 4. Video shot directions (save_video_plan)

One call per sequence. Give the sequence's lighting (one phrase, at most 14 words, time of day plus one light quality) and one shot per beat, in beat order:
- camera: "Medium shot, eye level, slow push-in." — from the vocabulary above, one move, consecutive shots differ in size or move. Keep the beat's own opening framing.
- action: ONE sentence, at most 25 words, the single visible physical action, exact names, no camera words, no dialogue, no looks.
- placement: every character in the shot at its first frame, "Name: left/center/right, foreground/midground/background, pose, facing ..." separated by semicolons; copy positions from the storyboard panel. "none" if nobody is in shot.
Dialogue is inserted word for word by the server from the script, with timing. The server builds the final timestamped clip prompt; read it back from the result.

## 4b. Clip prompts written by hand (save_clip_prompts)

The house template for a clip prompt, in this order (written for Episode 4, Sequence 11):
1. "Attachments: SEQ NN storyboard, <character> / <character> sheets, <location sheet name>."
2. Which storyboard panels the clip uses: "The storyboard is a 2x2 grid of four separate panels. Use Panel 1 (top-left) as the opening composition and Panel 2 (top-right) as the composition the shot ends on — one continuous shot. Panels 3 and 4 (bottom row) are spares — never show them." Name the panels this clip really uses; if a panel holds two pictures, say which one. Then what each sheet is for: "Use the character sheets for appearance only and the <location> sheet's '<panel name>' panel for the environment only."
3. "3D animated video, Pixar/DreamWorks style, full color, <N> seconds total, landscape 16:9. One single full-frame shot from start to end — never a split screen, never two pictures side by side." plus the light in one phrase.
4. "Staging — follow exactly:" where everyone is (left to right, front / back, sitting / standing), what stays fixed, Tilli's height rule ("Tilli's height reaches Jaksh's shoulder"), "Nobody else is present."
5. "The script of the video:" then each beat this clip plays, in the beat format: "BEAT N — Title [DURATION] Ns" and the lines [SUBJECT] [ACTION] [SETTING] [LIGHT] [CAMERA] [MOTION] [CONSTRAINTS] [DIALOGUE] [SFX], dialogue word for word with [pause NN].
6. "Follow the Script's Beat(s) … exactly. Use this timing:" one line per beat, "[0:00–0:08] Beat 24 — Dad names Cassiopeia (unhurried, ~2 words/sec)".
7. "Consistent character design and lighting throughout, matching the attached sheets. No morphing, warping, or distorted geometry. Avoid jitter and bent limbs. Use only the beats and panels required for this generation — do not use, reference, or invent any other beats, panels, shots, characters, or actions."
Never describe the characters' looks in words (the sheets do that). Timing: dialogue at a natural pace for the moment (about 2 words a second, plus every pause), silent beats as long as the action really takes; accepted clip lengths are 4, 5, 6, 8, 10, 12 and 15 s. One sequence is always one clip. Never shorten dialogue or speed it up to fit: when a sequence's beats need more than 15 s, split the sequence (split_sequence) — the new sequence can keep the same storyboard (its clip opens on the later panels) or get its own — and write one clip prompt per sequence. Save with save_clip_prompt.
- Harsh cut between two sequences that a trim can't fix: cover it with a short b-roll cutaway (2–4 s: the place, an object, the sky — same location, time of day and light, no dialogue, nobody whose position matters) placed over the cut in the edit. It costs a generation, so ask first unless a job's budget covers it.

## 5. Review loop

When the user shows a storyboard or clip with a problem: add_sequence_note (kind issue, what is wrong and in which beat), fix the cause with update_sequence or save_video_plan, tell the user what changed, and resolve_sequence_note once a new take is good. Every change is kept in the sequence's history.

Camera maps — only when a storyboard keeps failing. If a sequence's storyboard has come out wrong several times on layout or positions (things on the wrong side of frame, a mirrored view, a vehicle or tent in the wrong place) and prompt fixes have not worked, make a camera map. Never make one up front. Method: take the location's approved master image; mark the zones by name (e.g. parking lot, majlis, path into the camp, family tent, reeds, cove) and draw one numbered arrow per panel showing where the camera stands and which way it looks. Save it with record_reference_image (kind camera_map, issue_id of the issue it fixes; upload it to Magnific with the Magnific connector and pass its identifier), attach it to that sequence's storyboard with set_attachments (type reference), and rewrite the panels: each one names its camera number and says what sits on the left, in the center and on the right of frame (never compass directions or rotation angles), and the prompt says the map is ONLY a map — never draw its arrows, outlines, numbers or words.`;
}
