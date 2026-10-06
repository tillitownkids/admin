const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const source = readFileSync(resolve(__dirname, '../src/lib/sceneShots.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 } }).outputText;
const exported = {};
new Function('exports', compiled)(exported);
const {
  parseScriptBeats, dialogueWordCount, dialoguePauseSeconds, dialogueForVideo, planShotTiming,
  buildShotDirectionPrompt, validateShotDirection, buildShotPrompt, buildShotPlan,
  parseShotPlan, serializeShotPlan, sceneClips, SHOT_DURATIONS,
} = exported;

// The three tag styles found in saved scripts, plus a timing block whose
// "Dialogue: 3.3 seconds" line must not be read as the dialogue.
const script = `### **BEAT 22 — Nimo Apologizes**
EXT — ECHO PEBBLE GARDEN — LATE AFTERNOON — Nimo looks down.

**Emotional**

**105 WPM**

**[TIMING]**

Dialogue: 3.3 seconds

Estimated beat duration: 5.8 seconds

**[ACTION]** Nimo realizes his mistake
and apologizes to Tilli.

**[DIALOGUE]** Nimo: "Oh," <-Break 1.5 seconds-> "I'm sorry, Tilli. I really thought..."

**[CAMERA]** Close-up of Nimo's face.

**[MOTION]** Nimo's head dips slightly.

**[SFX]** Soft musical tone.

---

### BEAT 23 — Walking On

INT — CAR — NIGHT — Dark road.

**Normal**

**145 WPM**

**ACTION:** Jaksh looks out of the window.

**CAMERA:** Medium shot from inside the car.

**MOTION:** The car sways.

BEAT 24 — Plain Header
[ACTION] Tilli waves.
[DIALOGUE] Tilli: "Goodbye!"
[CAMERA] Wide shot.`;

const beats = parseScriptBeats(script);
assert.deepEqual(beats.map(b => b.number), [22, 23, 24]);
assert.equal(beats[0].title, 'Nimo Apologizes');
assert.equal(beats[0].setting, 'EXT — ECHO PEBBLE GARDEN — LATE AFTERNOON — Nimo looks down.');
assert.equal(beats[0].action, 'Nimo realizes his mistake and apologizes to Tilli.');
assert.equal(beats[0].dialogue, 'Nimo: "Oh," <-Break 1.5 seconds-> "I\'m sorry, Tilli. I really thought..."');
assert.equal(beats[0].camera, "Close-up of Nimo's face.");
assert.equal(beats[0].wpm, 105);
assert.equal(beats[1].action, 'Jaksh looks out of the window.');
assert.equal(beats[1].dialogue, '');
assert.equal(beats[1].camera, 'Medium shot from inside the car.');
assert.equal(beats[1].wpm, 145);
assert.equal(beats[2].title, 'Plain Header');
assert.equal(beats[2].dialogue, 'Tilli: "Goodbye!"');
assert.deepEqual(parseScriptBeats('No beats here.'), []);
assert.equal(parseScriptBeats('### BEAT 1 — Go\n**[WPM]** 132\n**[ACTION]** Run.')[0].wpm, 132);
for (const placeholder of ['None', 'None.', '*None*', '[No dialogue]', '(none)', '—', 'N/A', '']) {
  assert.equal(parseScriptBeats(`### BEAT 1 — Go\n**[DIALOGUE]** ${placeholder}\n**[ACTION]** Run.`)[0].dialogue, '', placeholder);
}
assert.equal(parseScriptBeats('### BEAT 1 — Go\n**[DIALOGUE]** Tilli: "None of us knew."')[0].dialogue, 'Tilli: "None of us knew."');

// A single-beat scene saved without its "BEAT N" header, and bold tags with "None" dialogue.
const headerless = `EXT — DESERT — LATE AFTERNOON — The path.

**[WPM]** 145 WPM

**ACTION** Jaksh stacks a stone cairn.

**DIALOGUE** None

**CAMERA** Wide shot of the path.`;
const [implicit] = parseScriptBeats(headerless);
assert.equal(parseScriptBeats(headerless).length, 1);
assert.equal(implicit.number, null);
assert.equal(implicit.setting, 'EXT — DESERT — LATE AFTERNOON — The path.');
assert.equal(implicit.action, 'Jaksh stacks a stone cairn.');
assert.equal(implicit.dialogue, '');
assert.equal(implicit.wpm, 145);
assert.equal(exported.sceneBeats({ scriptBeats: headerless, beatNumbers: [49], description: 'Cairns' })[0].number, 49);
assert.equal(exported.sceneBeats({ scriptBeats: script, beatNumbers: [1, 2, 3], description: '' })[0].number, 22);

assert.equal(dialogueWordCount(beats[0].dialogue), 7);
assert.equal(dialoguePauseSeconds(beats[0].dialogue), 1.5);
assert.equal(dialoguePauseSeconds('A: "x" <-Break 1 second-> "y" <break time="0.5s" />'), 1.5);
assert.equal(dialogueWordCount('Tilli: Hello there friend'), 3);
assert.equal(dialogueWordCount(''), 0);
assert.equal(dialogueForVideo(beats[0].dialogue), 'Nimo: "Oh," (pause) "I\'m sorry, Tilli. I really thought..."');

// Silent shots get a fixed short clip.
assert.deepEqual(planShotTiming({ dialogue: '', wpm: 145 }), { dialogueWords: 0, neededSeconds: 5, seconds: 5, overCap: false, overMax: false });
// 7 words at 105 WPM = 4 s, + 1.5 s pause + 0.5 s = 6 s.
assert.deepEqual(planShotTiming(beats[0]), { dialogueWords: 7, neededSeconds: 6, seconds: 6, overCap: false, overMax: false });
// A stated 185 WPM never speeds speech up: it is capped at 132 WPM (2.2 words/sec).
const words = (n) => `A: "${Array(n).fill('word').join(' ')}"`;
assert.equal(planShotTiming({ dialogue: words(14), wpm: 185 }).seconds, 8);
assert.equal(planShotTiming({ dialogue: words(14), wpm: null }).seconds, 8);
const long = planShotTiming({ dialogue: words(22), wpm: null });
assert.equal(long.seconds, 12);
assert.equal(long.overCap, true);
assert.equal(long.overMax, false);
const tooLong = planShotTiming({ dialogue: words(60), wpm: null });
assert.equal(tooLong.seconds, 15);
assert.equal(tooLong.overMax, true);
for (let n = 0; n < 80; n++) assert.ok(SHOT_DURATIONS.includes(planShotTiming({ dialogue: n ? words(n) : '', wpm: null }).seconds));

const scene = { locationName: 'Echo Pebble Garden', characterNames: ['Nimo the Bellbird', 'Tilli'], scriptBeats: script, description: 'Reassurance' };
const directionPrompt = buildShotDirectionPrompt(scene);
assert.match(directionPrompt, /in this order \[22,23,24\]/);
assert.match(directionPrompt, /"Nimo the Bellbird", "Tilli"/);
assert.match(directionPrompt, /BEAT 22 — Nimo Apologizes/);

const direction = {
  lighting: 'Warm late-afternoon light across the pebbles',
  shots: [
    { beat_number: 22, camera: 'Close-up, eye level, static (locked-off)', action: 'Nimo the Bellbird dips his head.' },
    { beat_number: 23, camera: 'Medium shot, eye level, slow push-in.', action: 'Jaksh turns to the window' },
    { beat_number: 24, camera: 'Wide shot, eye level, slow pull-back.', action: 'Tilli raises one hand and waves.' },
  ],
};
assert.equal(validateShotDirection(direction, beats), direction);
assert.throws(() => validateShotDirection({ ...direction, shots: direction.shots.slice(0, 2) }, beats));
assert.throws(() => validateShotDirection({ ...direction, shots: [direction.shots[1], direction.shots[0], direction.shots[2]] }, beats));
assert.throws(() => validateShotDirection({ ...direction, lighting: ' ' }, beats));
assert.throws(() => validateShotDirection({ ...direction, shots: [{ ...direction.shots[0], camera: '' }, ...direction.shots.slice(1)] }, beats));
assert.throws(() => validateShotDirection(null, beats));

const plan = buildShotPlan(scene, direction);
assert.deepEqual(plan.shots.map(s => [s.shot, s.beat, s.seconds, s.dialogueWords]), [[1, 22, 6, 7], [2, 23, 5, 0], [3, 24, 4, 1]]);
const first = plan.shots[0].prompt;
assert.match(first, /^Attachments: storyboard grid, character sheets \(Nimo the Bellbird, Tilli\), location sheet \(Echo Pebble Garden\)\./);
assert.match(first, /Use the panel numbered 1 in the attached storyboard grid as the opening composition/);
assert.match(first, /character sheets for character appearance only\. Use the location sheet for the environment only\./);
assert.match(first, /full color, 6 seconds total, landscape 16:9\. Warm late-afternoon light across the pebbles\. One continuous shot, no cuts\./);
assert.match(first, /Shot 1 \[0:00–0:06\] — Close-up, eye level, static \(locked-off\)\. Nimo the Bellbird dips his head\. Nimo: "Oh," \(pause\) "I'm sorry, Tilli\. I really thought\.\.\." — 7 words, spoken slowly/);
assert.match(first, /No morphing, warping, or distorted geometry\./);
assert.match(first, /with a clear pause at each \(pause\) and at punctuation\./);
assert.match(plan.shots[2].prompt, /Tilli: "Goodbye!" — 1 word, spoken slowly at about 2 words per second, with a clear pause at punctuation\./);
assert.match(plan.shots[1].prompt, /panel numbered 2/);
assert.match(plan.shots[1].prompt, /Jaksh turns to the window\. No one speaks\./);
assert.ok(first.split(/\s+/).length < 190, 'shot prompt stays lean');

// A single-beat scene uses its storyboard frame, not a grid panel.
const single = buildShotPrompt({ panel: 1, isGrid: false, seconds: 5, lighting: 'Soft dawn light', camera: 'Wide shot, eye level, static (locked-off)', action: 'The lantern flickers on.', dialogue: '', dialogueWords: 0, characterNames: [], locationName: '' });
assert.match(single, /^Attachments: storyboard frame, location sheet\./);
assert.match(single, /Use the attached storyboard frame as the opening composition/);
assert.doesNotMatch(single, /character sheets|No extra characters/);

// A scene without a parseable script is one shot built from its description.
const loose = buildShotPlan({ locationName: 'Square', characterNames: [], scriptBeats: '', description: 'Lantern glows' },
  { lighting: 'Dusk', shots: [{ beat_number: 1, camera: 'Wide shot, eye level, static (locked-off)', action: 'The lantern glows.' }] });
assert.equal(loose.shots.length, 1);
assert.equal(loose.shots[0].beat, null);

// Storage round trip; older plain-text prompts are not plans.
const withClips = { ...plan, shots: plan.shots.map((s, i) => (i === 1 ? s : { ...s, videoUrl: `https://x/${s.shot}.mp4`, magnificId: `m${s.shot}` })) };
assert.deepEqual(parseShotPlan(serializeShotPlan(withClips)), withClips);
assert.equal(parseShotPlan('## SCRIPT\nold prompt'), null);
assert.equal(parseShotPlan('{"format":"other","shots":[]}'), null);
assert.equal(parseShotPlan('{broken'), null);
assert.equal(parseShotPlan(null), null);

// Re-planning keeps a clip only when the same beat is still in the same position.
const replanned = buildShotPlan(scene, direction, withClips);
assert.deepEqual(replanned.shots.map(s => s.videoUrl), ['https://x/1.mp4', null, 'https://x/3.mp4']);
const shifted = buildShotPlan({ ...scene, scriptBeats: script.split('---')[1] }, { lighting: 'Night', shots: direction.shots.slice(1) }, withClips);
assert.deepEqual(shifted.shots.map(s => s.videoUrl), [null, null]);

// Shot clips play in shot order; a scene with no shot clips falls back to its older single clip.
const legacy = { clips: [{ url: 'https://x/legacy.mp4', shot: null }], missingShots: 0 };
assert.deepEqual(sceneClips({ video_prompt: serializeShotPlan(withClips), video_url: 'https://x/legacy.mp4' }),
  { clips: [{ url: 'https://x/1.mp4', shot: 1 }, { url: 'https://x/3.mp4', shot: 3 }], missingShots: 1 });
assert.deepEqual(sceneClips({ video_prompt: serializeShotPlan(plan), video_url: 'https://x/legacy.mp4' }), legacy);
assert.deepEqual(sceneClips({ video_prompt: '## SCRIPT', video_url: 'https://x/legacy.mp4' }), legacy);
assert.deepEqual(sceneClips({ video_prompt: null, video_url: null }), { clips: [], missingShots: 0 });

console.log('Scene shots: beat parsing, dialogue timing, shot prompts, plan storage and clip ordering passed.');
