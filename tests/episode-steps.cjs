const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const source = readFileSync(resolve(__dirname, '../src/lib/episodeSteps.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 } }).outputText;
const exported = {};
new Function('exports', compiled)(exported);
const { nextEpisodeStep, episodeStepStates, episodeStatusLine, episodeTitle, lockedStepReason, EPISODE_STEPS } = exported;

const base = { hasScript: false, scenes: 0, scenesWithImage: 0, scenesWithClip: 0, stitchedVideos: 0, publishedVideos: 0 };
assert.deepEqual(EPISODE_STEPS.map(s => s.key), ['story', 'script', 'storyboard', 'video', 'publish']);

// A new episode: the story exists, the script is next, everything after is locked.
assert.equal(nextEpisodeStep(base), 'script');
assert.deepEqual(episodeStepStates(base), { story: 'done', script: 'active', storyboard: 'locked', video: 'locked', publish: 'locked' });
assert.equal(episodeStatusLine(base), 'Script not written yet');

const scripted = { ...base, hasScript: true };
assert.equal(nextEpisodeStep(scripted), 'storyboard');
assert.equal(episodeStatusLine(scripted), 'Storyboard not started');
assert.equal(episodeStepStates(scripted).video, 'locked');

// Some storyboard images: storyboard is still the next step, but video is already open.
const partBoards = { ...scripted, scenes: 8, scenesWithImage: 3 };
assert.equal(nextEpisodeStep(partBoards), 'storyboard');
assert.deepEqual(episodeStepStates(partBoards), { story: 'done', script: 'done', storyboard: 'active', video: 'todo', publish: 'locked' });
assert.equal(episodeStatusLine(partBoards), '3 of 8 storyboard images');

const boarded = { ...scripted, scenes: 8, scenesWithImage: 8 };
assert.equal(nextEpisodeStep(boarded), 'video');
assert.equal(episodeStatusLine(boarded), 'No clips yet');
assert.equal(episodeStatusLine({ ...boarded, scenesWithClip: 5 }), 'Clips for 5 of 8 scenes, not stitched');

const stitched = { ...boarded, scenesWithClip: 8, stitchedVideos: 1 };
assert.equal(nextEpisodeStep(stitched), 'publish');
assert.deepEqual(episodeStepStates(stitched), { story: 'done', script: 'done', storyboard: 'done', video: 'done', publish: 'active' });
assert.equal(episodeStatusLine(stitched), 'Ready to publish');

const published = { ...stitched, publishedVideos: 1 };
assert.equal(nextEpisodeStep(published), 'publish');
assert.equal(episodeStepStates(published).publish, 'done');
assert.equal(episodeStatusLine(published), 'Published');

// An older episode stitched from partly-finished storyboards still reaches publishing.
const skipped = { ...partBoards, scenesWithClip: 3, stitchedVideos: 1 };
assert.equal(episodeStepStates(skipped).publish, 'todo');
assert.equal(nextEpisodeStep(skipped), 'storyboard');

assert.match(lockedStepReason('video'), /storyboard image/);
assert.equal(lockedStepReason('story'), '');

assert.equal(episodeTitle({ content: '# **The Missing Crystals**\n\nOnce upon a time', topic: 'Tilli and Jaksh split up to recover three missing ...' }), 'The Missing Crystals');
assert.equal(episodeTitle({ content: '<h1><strong>Fireflies &amp; Friends</strong></h1><p>Text</p>', topic: 'x' }), 'Fireflies & Friends');
assert.equal(episodeTitle({ content: 'No heading here', topic: ' A desert trip ' }), 'A desert trip');
assert.equal(episodeTitle({ content: null, topic: '' }), 'Untitled episode');

console.log('Episode steps: next step, step states, status lines and titles passed.');
