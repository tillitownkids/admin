const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');

function load(file, modules = {}) {
  const source = readFileSync(resolve(__dirname, '..', file), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 } }).outputText;
  const exported = {};
  new Function('exports', 'require', compiled)(exported, (id) => modules[id] ?? require(id));
  return exported;
}
const shots = load('src/lib/sceneShots.ts');
const {
  SCENE_MAX_SECONDS, buildBeatTimingPrompt, resolveBeatTimings, runtimeSeconds, formatRuntime,
  sceneLengthProblems, splitLongScenes, lengthenShortScenes, withBeatDurations, sceneRuntime,
} = load('src/lib/sceneTiming.ts', { '@/lib/sceneShots': shots });

const words = (n) => `A: "${Array(n).fill('word').join(' ')}"`;
const script = [
  '### BEAT 1 — Wake\nINT — BEDROOM — MORNING — Sun.\n**[ACTION]** Jaksh opens his eyes.',
  `### BEAT 2 — Call\n**[ACTION]** Jaksh calls Tilli.\n**[DIALOGUE]** ${words(14)}`,
  '### BEAT 3 — Run\n**[ACTION]** Jaksh runs downstairs.',
  '### BEAT 4 — Look\n**[ACTION]** Tilli looks up.',
].join('\n\n---\n\n');
const beats = shots.parseScriptBeats(script);

// The agent sees every beat with its dialogue floor, in order.
const prompt = buildBeatTimingPrompt(beats);
assert.match(prompt, /in this order \[1,2,3,4\]/);
assert.match(prompt, /Beat 2 — Call[\s\S]*speech: 7\.\d s/);
assert.match(prompt, /Beat 4 — Look\nAction: Tilli looks up\.\nDialogue: none/);

// Estimates become accepted clip lengths; dialogue is a floor, 8 s caps action, a missing beat falls back.
const timings = resolveBeatTimings(beats, { beats: [
  { beat_number: 1, seconds: 3.5 },
  { beat_number: 2, seconds: 4 },
  { beat_number: 3, seconds: 11 },
  { beat_number: 4, seconds: 'soon' },
] });
assert.deepEqual(timings.map((t) => t.seconds), [4, 8, 8, 5]);
assert.deepEqual(timings.map((t) => t.estimated), [true, true, true, false]);
assert.equal(timings[1].speechSeconds > 7, true);
for (const timing of timings) assert.ok(shots.SHOT_DURATIONS.includes(timing.seconds));
assert.deepEqual(resolveBeatTimings(beats, null).map((t) => t.seconds), [5, 8, 5, 5]);
assert.equal(runtimeSeconds(timings), 25);
assert.equal(formatRuntime(48), '48 s');
assert.equal(formatRuntime(120), '2 min');
assert.equal(formatRuntime(154), '2 min 34 s');

// Scene lengths: only multi-beat scenes over 15 s are problems.
const scene = (number, beatNumbers) => ({ scene_number: number, title: `Scene ${number}`, location_name: 'Home', character_names: ['Jaksh'], beat_numbers: beatNumbers });
const t = (seconds) => seconds.map((value, index) => ({ beat: index + 1, seconds: value, speechSeconds: 0, estimated: true }));
const long = t([6, 6, 6, 6, 15]);
assert.deepEqual(sceneLengthProblems([scene(1, [1, 2, 3, 4]), scene(2, [5])], long), [
  'Scene 1 (beats 1–4) runs 24 s, over the 15 s limit.',
]);

// An overlong scene is split into the fewest parts that fit, as evenly as possible, and renumbered.
const split = splitLongScenes([scene(1, [1, 2, 3, 4]), scene(2, [5])], long);
assert.deepEqual(split.map((s) => s.beat_numbers), [[1, 2], [3, 4], [5]]);
assert.deepEqual(split.map((s) => s.scene_number), [1, 2, 3]);
assert.deepEqual(split.map((s) => s.title), ['Scene 1', 'Scene 1 (part 2)', 'Scene 2']);
assert.deepEqual(splitLongScenes([scene(1, [1, 2, 3])], t([7, 4, 4])).map((s) => s.beat_numbers), [[1, 2, 3]]);
assert.deepEqual(splitLongScenes([scene(1, [1, 2, 3])], t([8, 6, 5])).map((s) => s.beat_numbers), [[1], [2, 3]]);
for (const parts of [split]) for (const part of parts) {
  assert.ok(part.beat_numbers.length === 1 || part.beat_numbers.reduce((sum, b) => sum + long[b - 1].seconds, 0) <= SCENE_MAX_SECONDS);
}

// A lone 4 s beat is lengthened to the 5 s minimum; longer scenes are untouched.
const short = lengthenShortScenes([scene(1, [1]), scene(2, [2, 3])], t([4, 4, 4]));
assert.deepEqual(short.map((x) => x.seconds), [5, 4, 4]);

// Durations are written into each beat of the scene text, replacing older ones, and read back by the video stage.
const sceneText = '### BEAT 1 — Wake\n**[ACTION]** Opens eyes.\n**[DURATION]** 9 seconds\n\n---\n\n### BEAT 2 — Call\n**[DIALOGUE]** A: "Hi"\n';
const withDurations = withBeatDurations(sceneText, [1, 2], t([5, 6]));
assert.equal(withDurations, '### BEAT 1 — Wake\n**[ACTION]** Opens eyes.\n**[DURATION]** 5 seconds\n\n---\n\n### BEAT 2 — Call\n**[DIALOGUE]** A: "Hi"\n**[DURATION]** 6 seconds\n');
assert.deepEqual(shots.parseScriptBeats(withDurations).map((b) => b.seconds), [5, 6]);
assert.equal(shots.parseScriptBeats(withDurations)[1].dialogue, 'A: "Hi"');
const headerless = withBeatDurations('EXT — DESERT — DAY — Path.\n**[ACTION]** Jaksh waves.', [7], [{ beat: 7, seconds: 6 }]);
assert.match(headerless, /Jaksh waves\.\n\*\*\[DURATION\]\*\* 6 seconds$/);
assert.equal(sceneRuntime({ script_beats: withDurations, beat_numbers: [1, 2] }), 11);
// Older scenes without durations are timed by their dialogue.
assert.equal(sceneRuntime({ script_beats: sceneText.replace(/\*\*\[DURATION\]\*\* 9 seconds\n/, ''), beat_numbers: [1, 2] }), 9);
assert.equal(sceneRuntime({ script_beats: '', beat_numbers: [] }), 0);

console.log('Scene timing: agent prompt, timing resolution, scene length limits, splitting and duration storage passed.');
