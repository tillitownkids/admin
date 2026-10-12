const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');

function load(file) {
  const source = readFileSync(resolve(__dirname, '..', file), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 } }).outputText;
  const exported = {};
  new Function('exports', 'require', compiled)(exported, require);
  return exported;
}
const props = load('src/lib/propSheet.ts');
const shots = load('src/lib/sceneShots.ts');

// Kinds.
assert.equal(props.isPropKind('permanent'), true);
assert.equal(props.isPropKind('episode'), true);
assert.equal(props.isPropKind('scene'), false);

// The sheet prompt keeps the description and asks for the object alone, from several sides.
const sheet = props.propSheetPrompt('  A small red hatchback with a roof rack. ');
assert.match(sheet, /A small red hatchback with a roof rack\./);
assert.match(sheet, /single object only, with no people or characters/);
assert.match(sheet, /front view, a side view and a back view/);

// The detection prompt lists the library so existing objects are reused, and strips story HTML.
const prompt = props.buildObjectDetectionPrompt('<h1>Trip</h1><p>Jaksh packs his <b>Blue Backpack</b>.</p>', [
  { name: 'Blue Backpack', description: 'A blue canvas backpack.' },
]);
assert.match(prompt, /- "Blue Backpack": A blue canvas backpack\./);
assert.match(prompt, /Trip Jaksh packs his Blue Backpack \./);
assert.doesNotMatch(prompt, /<p>|<b>/);
assert.match(prompt, new RegExp(`at most ${props.MAX_EPISODE_OBJECTS} objects`));
assert.match(props.buildObjectDetectionPrompt('Story.', []), /EXISTING OBJECTS LIBRARY:\nNone yet\./);

// Parsing: invalid and duplicate entries are dropped, flags default to false, the list is capped.
assert.deepEqual(props.parseDetectedObjects({ objects: [
  { name: '  Camping   Tent ', description: 'A green dome tent.', recurring: false },
  { name: 'camping tent', description: 'Duplicate.' },
  { name: '', description: 'No name.' },
  { description: 'Missing name.' },
  { name: 'Family Car', description: 'A red hatchback.', existing: true, recurring: true },
  { name: 'Map', recurring: 'yes' },
] }), [
  { name: 'Camping Tent', description: 'A green dome tent.', existing: false, recurring: false },
  { name: 'Family Car', description: 'A red hatchback.', existing: true, recurring: true },
  { name: 'Map', description: '', existing: false, recurring: false },
]);
assert.deepEqual(props.parseDetectedObjects({ objects: [] }), []);
// Parts of a character are dropped even when the model lists them.
assert.deepEqual(props.parseDetectedObjects({ objects: [
  { name: "Tilli's Compass", description: "A compass mounted permanently on Tilli's chest as part of his built-in design." },
  { name: 'Leather Sandals', description: 'Flat tan sandals worn by Jaksh.' },
  { name: 'Camping Tent', description: 'A cream dome tent with guy ropes attached to stakes.' },
] }).map((object) => object.name), ['Camping Tent']);
assert.throws(() => props.parseDetectedObjects({ items: [] }));
const many = { objects: Array.from({ length: 12 }, (_, i) => ({ name: `Object ${i}`, description: 'x' })) };
assert.equal(props.parseDetectedObjects(many).length, props.MAX_EPISODE_OBJECTS);

// Video: object sheets are attached and given their role; without objects the prompt is unchanged.
const base = {
  panel: 1, isGrid: false, seconds: 6, lighting: 'Warm light', camera: 'Medium shot, eye level, static (locked-off)',
  action: 'Jaksh opens the car door', dialogue: '', dialogueWords: 0, characterNames: ['Jaksh'], locationName: 'Driveway',
};
const withObjects = shots.buildShotPrompt({ ...base, objectNames: ['Family Car', 'Blue Backpack'] });
assert.match(withObjects, /object sheets \(Family Car, Blue Backpack\)/);
assert.match(withObjects, /Use the object sheets for object appearance only\./);
assert.equal(shots.buildShotPrompt({ ...base, objectNames: [] }), shots.buildShotPrompt(base));
assert.doesNotMatch(shots.buildShotPrompt(base), /object sheet/);

const direction = shots.buildShotDirectionPrompt({
  locationName: 'Driveway', characterNames: ['Jaksh'], objectNames: ['Family Car'],
  scriptBeats: '### BEAT 1 — Go\n**[ACTION]** Jaksh opens the car.', description: '',
});
assert.match(direction, /Characters \(exact names\): "Jaksh"\nObjects \(exact names\): "Family Car"/);
assert.doesNotMatch(shots.buildShotDirectionPrompt({
  locationName: 'Driveway', characterNames: ['Jaksh'], scriptBeats: '### BEAT 1 — Go\n**[ACTION]** Run.', description: '',
}), /Objects \(exact names\)/);

console.log('Object sheets: kinds, sheet prompt, detection prompt and parsing, and object references in shot prompts passed.');
