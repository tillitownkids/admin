const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');

// An in-memory stand-in for the Supabase client: just the calls the takes code makes.
function fakeSupabase(tables) {
  let sequence = 0;
  const removedFiles = [];
  const from = (table) => {
    const state = { op: 'select', values: null, filters: [], orders: [] };
    const matching = () => tables[table].filter((row) => state.filters.every((test) => test(row)));
    const run = () => {
      if (state.op === 'insert') {
        const inserted = state.values.map((values) => {
          sequence += 1;
          return { id: `asset-${sequence}`, created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, sequence)).toISOString(), ...values };
        });
        tables[table].push(...inserted);
        return { data: inserted, error: null };
      }
      if (state.op === 'update') {
        const rows = matching();
        rows.forEach((row) => Object.assign(row, state.values));
        return { data: rows, error: null };
      }
      if (state.op === 'delete') {
        const rows = matching();
        tables[table] = tables[table].filter((row) => !rows.includes(row));
        return { data: rows, error: null };
      }
      const rows = matching().slice().sort((a, b) => {
        for (const [column, ascending] of state.orders) {
          if (a[column] === b[column]) continue;
          return (a[column] < b[column] ? -1 : 1) * (ascending ? 1 : -1);
        }
        return 0;
      });
      return { data: rows, error: null };
    };
    const builder = {
      select: () => builder,
      insert: (values) => { state.op = 'insert'; state.values = values; return builder; },
      update: (values) => { state.op = 'update'; state.values = values; return builder; },
      delete: () => { state.op = 'delete'; return builder; },
      eq: (column, value) => { state.filters.push((row) => row[column] === value); return builder; },
      neq: (column, value) => { state.filters.push((row) => row[column] !== value); return builder; },
      in: (column, values) => { state.filters.push((row) => values.includes(row[column])); return builder; },
      order: (column, options) => { state.orders.push([column, options?.ascending !== false]); return builder; },
      maybeSingle: async () => ({ data: run().data[0] ?? null, error: null }),
      single: async () => ({ data: run().data[0] ?? null, error: null }),
      then: (onResolved, onRejected) => Promise.resolve(run()).then(onResolved, onRejected),
    };
    return builder;
  };
  const storage = { from: (bucket) => ({ remove: async (paths) => { removedFiles.push(...paths.map((path) => `${bucket}/${path}`)); return { error: null }; } }) };
  return { from, storage, removedFiles, tables: () => tables };
}

function load(file, modules) {
  const source = readFileSync(resolve(__dirname, file), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 } }).outputText;
  const exported = {};
  new Function('exports', 'require', compiled)(exported, (name) => {
    if (!(name in modules)) throw new Error(`Unexpected import: ${name}`);
    return modules[name];
  });
  return exported;
}

const STORE = 'https://project.supabase.co/storage/v1/object/public';
const tables = {
  Character: [{ id: 'char-1', generated_image_url: null, magnific_identifier: null }],
  Location: [],
  Scene: [
    { id: 'scene-old', storyboard_image_url: `${STORE}/storyboards/scene-old_first.png`, magnific_identifier: 'first', storyboard_status: 'generated' },
    { id: 'scene-new', storyboard_image_url: null, magnific_identifier: null, storyboard_status: 'pending' },
  ],
  ImageAsset: [],
};
const supabase = fakeSupabase(tables);
const storage = load('../src/lib/storage.ts', { '@/lib/supabase': { supabase } });
const {
  recordGeneratedImageVersion, listGeneratedImageHistory, restoreGeneratedImageVersion, deleteGeneratedImageVersion,
  isGeneratedImageOwnerType, GeneratedImageHistoryError,
} = load('../src/lib/generatedImageHistory.ts', { '@/lib/supabase': { supabase }, '@/lib/storage': storage });

const scene = (id) => supabase.tables().Scene.find((row) => row.id === id);
const take = (ownerId, name, use) => ({
  ownerType: 'scene_storyboard',
  ownerId,
  publicUrl: `${STORE}/storyboards/${ownerId}_${name}.png`,
  storagePath: `${ownerId}_${name}.png`,
  storageBucket: 'storyboards',
  providerIdentifier: name,
  use,
});

(async () => {
  assert.equal(isGeneratedImageOwnerType('scene_storyboard'), true);
  assert.equal(isGeneratedImageOwnerType('scene_clip'), false);
  assert.deepEqual(storage.storageLocationFromUrl(`${STORE}/storyboards/a%20b.png?v=1`), { bucket: 'storyboards', path: 'a b.png' });
  assert.equal(storage.storageLocationFromUrl('https://cdn.example.com/a.png'), null);

  // An image saved before takes were recorded shows as the one take, in use.
  let takes = await listGeneratedImageHistory('scene_storyboard', ['scene-old', 'scene-new']);
  assert.deepEqual(takes.map((t) => [t.owner_id, t.id, t.is_selected]), [['scene-old', null, true]]);

  // A new take is kept beside it. The image in use stays in use and gets its own record.
  const second = await recordGeneratedImageVersion(take('scene-old', 'second', 'if-none'));
  assert.equal(second.is_selected, false);
  assert.equal(scene('scene-old').magnific_identifier, 'first', 'the scene keeps the image that was chosen');
  takes = await listGeneratedImageHistory('scene_storyboard', 'scene-old');
  assert.deepEqual(takes.map((t) => [t.provider_identifier, t.is_selected]), [['first', true], ['second', false]]);
  assert.ok(takes.every((t) => t.id), 'the earlier image is now a recorded take');
  assert.equal(supabase.tables().ImageAsset[0].storage_bucket, 'storyboards');
  assert.equal(supabase.tables().ImageAsset[0].storage_path, 'scene-old_first.png');

  // Saving the same image again does not list it twice.
  await recordGeneratedImageVersion(take('scene-old', 'second', 'if-none'));
  assert.equal((await listGeneratedImageHistory('scene_storyboard', 'scene-old')).length, 2);

  // Choosing a take points the scene at it, with the generator reference the video step needs.
  const chosen = await restoreGeneratedImageVersion(second.id);
  assert.equal(chosen.is_selected, true);
  assert.equal(scene('scene-old').storyboard_image_url, `${STORE}/storyboards/scene-old_second.png`);
  assert.equal(scene('scene-old').magnific_identifier, 'second');
  takes = await listGeneratedImageHistory('scene_storyboard', 'scene-old');
  assert.deepEqual(takes.map((t) => t.is_selected), [false, true]);
  assert.deepEqual(supabase.tables().ImageAsset.map((row) => row.is_selected), [false, true]);

  // The take in use cannot be deleted; any other can, and its file goes with it.
  await assert.rejects(deleteGeneratedImageVersion(second.id), (error) => error instanceof GeneratedImageHistoryError && error.status === 409);
  const first = takes[0];
  const removed = await deleteGeneratedImageVersion(first.id);
  assert.equal(removed.storageDeleted, true);
  assert.deepEqual(supabase.removedFiles, ['storyboards/scene-old_first.png']);
  assert.equal((await listGeneratedImageHistory('scene_storyboard', 'scene-old')).length, 1);
  await assert.rejects(restoreGeneratedImageVersion(first.id), (error) => error.status === 404);

  // The first image of a scene is put in use straight away; later ones wait to be chosen.
  const firstOfNew = await recordGeneratedImageVersion(take('scene-new', 'a', 'if-none'));
  assert.equal(firstOfNew.is_selected, true);
  assert.equal(scene('scene-new').storyboard_image_url, `${STORE}/storyboards/scene-new_a.png`);
  assert.equal(scene('scene-new').storyboard_status, 'generated');
  await recordGeneratedImageVersion(take('scene-new', 'b', 'if-none'));
  await recordGeneratedImageVersion(take('scene-new', 'c', 'if-none'));
  assert.equal(scene('scene-new').magnific_identifier, 'a');
  takes = await listGeneratedImageHistory('scene_storyboard', ['scene-new', 'scene-old']);
  assert.deepEqual(takes.map((t) => [t.owner_id, t.provider_identifier, t.is_selected]), [
    ['scene-new', 'a', true], ['scene-new', 'b', false], ['scene-new', 'c', false], ['scene-old', 'second', true],
  ]);

  // Saving a character or location with a sheet puts that sheet in use, as before.
  const sheet = (name) => ({ ownerType: 'character_generated', ownerId: 'char-1', publicUrl: `${STORE}/episode-assets/character_sheets/${name}.png`, storagePath: `character_sheets/${name}.png`, storageBucket: 'episode-assets', providerIdentifier: name });
  await recordGeneratedImageVersion(sheet('one'));
  const two = await recordGeneratedImageVersion(sheet('two'));
  assert.equal(two.is_selected, true);
  assert.equal(supabase.tables().Character[0].magnific_identifier, 'two');
  assert.deepEqual((await listGeneratedImageHistory('character_generated', 'char-1')).map((t) => [t.provider_identifier, t.is_selected]), [['one', false], ['two', true]]);

  await assert.rejects(recordGeneratedImageVersion({ ...sheet('x'), ownerId: 'missing' }), (error) => error.status === 404);

  console.log('Takes: recording, keeping the image in use, choosing, deleting and listing passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
