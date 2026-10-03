const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const source = readFileSync(resolve(__dirname, '../src/lib/storyboardGeneration.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 } }).outputText;
const exported = {};
new Function('exports', compiled)(exported);
const { parseStoryboardJson, validateScenePlan, validateSceneOutput, mapWithConcurrency } = exported;

const scene = (number, beats) => ({ scene_number: number, title: 'Scene', location_name: 'Square', character_names: ['Tilli'], beat_numbers: beats, estimated_duration_seconds: 7 });
const valid = { total_beats: 3, scenes: [scene(1, [1, 2]), scene(2, [3])] };
assert.equal(validateScenePlan(valid).length, 2);
for (const invalid of [
  { ...valid, total_beats: 4 },
  { ...valid, scenes: [scene(1, [1]), scene(2, [3])] },
  { ...valid, scenes: [scene(1, [1, 2]), scene(2, [2])] },
  { ...valid, scenes: [scene(1, [2, 1]), scene(2, [3])] },
  { total_beats: 7, scenes: [scene(1, [1, 2, 3, 4, 5, 6, 7])] },
  { total_beats: 2, scenes: [{ ...scene(1, [1, 2]), estimated_duration_seconds: 9 }] },
]) assert.throws(() => validateScenePlan(invalid));
assert.doesNotThrow(() => validateScenePlan({ total_beats: 1, scenes: [{ ...scene(1, [1]), estimated_duration_seconds: 10 }] }));
assert.deepEqual(parseStoryboardJson('```json\n{"scenes":[]}\n```'), { scenes: [] });
assert.throws(() => parseStoryboardJson('{"scenes":['));
const output = { beat_numbers: [1], scene_script_beats: 'BEAT 1\nHello.', storyboard_prompt: 'Render scene.' };
assert.doesNotThrow(() => validateSceneOutput(output, [1], 'Title\nBEAT 1\r\nHello.\nEND'));
assert.throws(() => validateSceneOutput(output, [2]));
assert.throws(() => validateSceneOutput({ ...output, scene_script_beats: '' }, [1]));
assert.throws(() => validateSceneOutput(output, [1], 'BEAT 1\nDifferent dialogue.'));

(async () => {
  let active = 0;
  let peak = 0;
  const result = await mapWithConcurrency([30, 5, 20, 1, 2], 3, async (delay, index) => {
    active++;
    peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, delay));
    active--;
    return index;
  });
  assert.deepEqual(result, [0, 1, 2, 3, 4]);
  assert.equal(peak, 3);
  let settled = false;
  let started = 0;
  await assert.rejects(mapWithConcurrency([0, 1, 2, 3], 2, async (_, index) => {
    started++;
    if (index === 0) throw new Error('Expected failure');
    await new Promise(resolve => setTimeout(resolve, 10));
    settled = true;
  }), /Expected failure/);
  assert.equal(settled, true);
  assert.equal(started, 2);
  console.log('Storyboard validation, exact-copy checks, strict JSON, concurrency/order and failure handling passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
