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
const names = load('src/lib/characterNames.ts');
const shots = load('src/lib/sceneShots.ts');
const check = load('src/lib/characterContinuity.ts', { '@/lib/characterNames': names, '@/lib/sceneShots': shots });

const cast = [
  { name: 'Jaksh', description: 'A curious six-year-old boy.' },
  { name: "Jaksh's Father - Kartik", description: 'Jaksh\'s dad, a calm carpenter.' },
  { name: 'Tilli', description: 'A small talking bird.' },
];

// Names match whole, in any case, never inside a longer word or name.
assert.equal(check.mentionsName('JAKSH runs in.', 'Jaksh'), true);
assert.equal(check.mentionsName("Jaksh's Father - Kartik waves.", "Jaksh's Father - Kartik"), true);
assert.equal(check.mentionsName('Jakshan runs in.', 'Jaksh'), false);
assert.equal(check.mentionsName('Tillitown square.', 'Tilli'), false);

// Short names: each part of "Name - Name" belongs to its member, unless two members share it.
const aliases = check.castAliases([...cast, { name: 'Kartik - Uncle' }]);
assert.equal(aliases.get("jaksh's father"), "Jaksh's Father - Kartik");
assert.equal(aliases.has('kartik'), false);
assert.equal(check.castAliases(cast).get('kartik'), "Jaksh's Father - Kartik");
assert.equal(aliases.get('jaksh'), 'Jaksh');

// The agent's prompt lists the cast with their short names, earlier beats as context, and the beats in order.
const prompt = check.buildCastCheckPrompt({
  cast, scriptBeats: '### BEAT 3\n**[ACTION]** Dad hugs Jaksh.', beatNumbers: [3], earlierBeats: '### BEAT 2\n**[ACTION]** Kartik sits by the fire.',
});
assert.match(prompt, /- "Jaksh's Father - Kartik" \(also called "Jaksh's Father", "Kartik"\): Jaksh's dad, a calm carpenter\./);
assert.match(prompt, /- "Jaksh": A curious six-year-old boy\./);
assert.match(prompt, /EARLIER BEATS \(context only[^\n]*\n"""\n### BEAT 2\n\*\*\[ACTION\]\*\* Kartik sits by the fire\.\n"""/);
assert.match(prompt, /BEATS TO DECIDE:\n"""\n### BEAT 3\n\*\*\[ACTION\]\*\* Dad hugs Jaksh\./);
assert.match(prompt, /Track who is present/);
assert.match(prompt, /keep each list as small as the shot allows/);
assert.match(prompt, /in this order \[3\]/);
assert.doesNotMatch(check.buildCastCheckPrompt({ cast, scriptBeats: 'x', beatNumbers: [1] }), /EARLIER BEATS/);

// Answers are mapped to exact cast names, short names included; a cast member put "outside the cast"
// is still that member; unknown names are held back for a retry, never attached.
const parsed = check.parseBeatCast({ beats: [
  { beat_number: 3, on_screen: ['jaksh', 'Kartik', 'Dad'], not_in_cast: ['Mailman', 'tilli'] },
  { beat_number: 4, on_screen: [], not_in_cast: [] },
] }, cast, [3, 4]);
assert.deepEqual(parsed.beats[0].onScreen, ['Jaksh', "Jaksh's Father - Kartik", 'Tilli']);
assert.deepEqual(parsed.beats[0].notInCast, ['Mailman']);
assert.deepEqual(parsed.unknown, ['Dad']);
assert.throws(() => check.parseBeatCast({ beats: [{ beat_number: 4, on_screen: [] }] }, cast, [3]), /out of order/);
assert.throws(() => check.parseBeatCast({ beats: [] }, cast, [3]), /exactly 1 beat/);

// Two reads are combined: a character one read alone shows is dropped unless both reads place them there.
assert.deepEqual(check.agreedBeatCast(
  [{ beat: 2, onScreen: ['Jaksh', 'Tilli', "Jaksh's Father - Kartik"], notInCast: ['Mailman'] }, { beat: 3, onScreen: ['Tilli'], notInCast: [] }],
  [{ beat: 2, onScreen: ['tilli', 'Jaksh'], notInCast: ['Mailman', 'Baker'] }, { beat: 3, onScreen: [], notInCast: [] }],
), [{ beat: 2, onScreen: ['Jaksh', 'Tilli'], notInCast: ['Mailman'], present: ['Jaksh', 'Tilli'] }, { beat: 3, onScreen: [], notInCast: [], present: [] }]);
assert.deepEqual(check.agreedBeatCast([{ beat: 2, onScreen: ['Jaksh'], notInCast: [] }], [{ beat: 9, onScreen: ['Jaksh'], notInCast: [] }]), [{ beat: 2, onScreen: [], notInCast: [], present: [] }]);
// Both reads put Tilli in the jeep; one shows her, one does not: she is shown. Kartik is in only one read's place.
assert.deepEqual(check.agreedBeatCast(
  [{ beat: 1, onScreen: ['Jaksh', 'Tilli'], notInCast: [], present: ['Jaksh', 'Tilli', "Jaksh's Mother - Sonal"] }],
  [{ beat: 1, onScreen: ['Jaksh', "Jaksh's Father - Kartik"], notInCast: [], present: ['Jaksh', 'Tilli', "Jaksh's Father - Kartik"] }],
), [{ beat: 1, onScreen: ['Jaksh', 'Tilli'], notInCast: [], present: ['Jaksh', 'Tilli'] }]);
// The agent's "present" list is read by exact name, and everyone on screen is present.
assert.deepEqual(check.parseBeatCast({ beats: [{ beat_number: 1, on_screen: ['Jaksh'], present: ['Kartik', 'Nobody'] }] }, cast, [1]).beats[0].present, ["Jaksh's Father - Kartik", 'Jaksh']);

// Speakers are on screen unless their line is off-screen.
assert.deepEqual(check.dialogueSpeakers('Jaksh: "Oasis!" <-Break 0.5 seconds-> Tilli: "Oasis!"', cast), ['Jaksh', 'Tilli']);
assert.deepEqual(check.dialogueSpeakers('Kartik (O.S.): "Come back!" <-Break 1 second-> Jaksh (whispering): "Sorry."', cast), ['Jaksh']);
assert.deepEqual(check.dialogueSpeakers("Jaksh's Father - Kartik: \"Look up.\" Tilli (V.O.): \"Wow.\"", cast), ["Jaksh's Father - Kartik"]);
assert.deepEqual(check.dialogueSpeakers('Kartik: "Jaksh, Tilli," <-Break 0.5 seconds-> "Take this to the tent."', cast), ["Jaksh's Father - Kartik"]);
assert.deepEqual(check.dialogueSpeakers('', cast), []);
const jeepScene = {
  scriptBeats: '### BEAT 1\n**[ACTION]** Kartik steers the jeep.\n**[DIALOGUE]** Jaksh: "Are we there?"\n\n---\n\n### BEAT 2\n**[ACTION]** The jeep crests the ridge.\n**[DIALOGUE]** Jaksh: "Oasis!" <-Break 0.5 seconds-> Tilli: "Oasis!"',
  description: '',
};
assert.deepEqual(check.withSpeakers([
  { beat: 1, onScreen: ["Jaksh's Father - Kartik"], notInCast: [] },
  { beat: 2, onScreen: [], notInCast: [] },
], jeepScene, cast).map((beat) => beat.onScreen), [["Jaksh's Father - Kartik", 'Jaksh'], ['Jaksh', 'Tilli']]);

// Cast members a text names: full names first, so the father does not also count as Jaksh.
assert.deepEqual(check.castNamedIn("Jaksh's Father - Kartik (left) steers; Tilli (right) looks ahead.", cast), ["Jaksh's Father - Kartik", 'Tilli']);
assert.deepEqual(check.castNamedIn('Kartik steers while Jaksh and Tilli wave.', cast).sort(), ["Jaksh", "Jaksh's Father - Kartik", 'Tilli'].sort());
assert.deepEqual(check.castNamedIn('The jeep climbs the dune.', cast), []);

// The episode is read in groups of whole scenes, each with the scenes just before it as context.
const scene = (id, beats) => ({ id, beatNumbers: beats });
const episode = [scene('a', [1, 2, 3, 4]), ...Array.from({ length: 22 }, (_, i) => scene(`s${i}`, [i + 5])), scene('z', [27, 28, 29])];
const chunks = check.castCheckChunks(episode);
assert.deepEqual(chunks.map((chunk) => chunk.scenes.length), [5, 8, 8, 3]);
assert.deepEqual(chunks[0].earlier, []);
assert.deepEqual(chunks[1].earlier.map((item) => item.id), ['a', 's0', 's1', 's2', 's3']);
assert.deepEqual(chunks[3].earlier.map((item) => item.id), ['s14', 's15', 's16', 's17', 's18', 's19']);
assert.deepEqual(check.castCheckChunks([scene('big', Array.from({ length: 30 }, (_, i) => i + 1)), scene('b', [31])]).map((chunk) => chunk.scenes.map((item) => item.id)), [['big'], ['b']]);

// Placement: a character is placed by a bracket after their name that says which side of frame.
assert.equal(check.placesInPanel('Jaksh (left, foreground, kneeling, facing right) waves.', 'Jaksh'), true);
assert.equal(check.placesInPanel('Jaksh (kneeling) waves on the left.', 'Jaksh'), false);
assert.equal(check.placesInPanel("Jaksh's Father - Kartik (center, background) waves.", 'Jaksh'), false);

const storyboard = [
  'Full-color 3D CGI animation frame.',
  '',
  'Create a single 4-panel 3D animation panel grid, arranged in a 2x2 grid.',
  '',
  'Characters: Jaksh. Each appears as exactly one individual, matching the attached reference images.',
  '',
  'Setting: Workshop — a wooden shed.',
  '',
  'All panels: Warm morning light.',
  '',
  'Panel 1: Medium shot, eye level — Jaksh (left, midground, standing, facing right) stands at the door.',
  '',
  'Panel 2: Close-up, eye level — a hammer on the bench.',
  '',
  'Panel 3: (spare) Wide shot — the workshop.',
  '',
  'Panel 4: (spare) Close-up — the door.',
  '',
  'Keep the characters and the location visually identical across all panels.',
].join('\n');

const panels = check.storyboardPanels(storyboard);
assert.equal(panels.size, 4);
assert.equal(panels.get(1), 'Medium shot, eye level — Jaksh (left, midground, standing, facing right) stands at the door.');
assert.equal(panels.get(4), '(spare) Close-up — the door.');

// Beat 2 shows the father, but he is neither attached nor in panel 2 or the Characters line.
const beats = [
  { beat: 1, onScreen: ['Jaksh'], notInCast: [] },
  { beat: 2, onScreen: ['Jaksh', "Jaksh's Father - Kartik"], notInCast: ['Mailman'] },
];
let issues = check.findCharacterIssues({ beats, linked: ['Jaksh', 'Tilli'], storyboardPrompt: storyboard, videoPrompt: null });
assert.deepEqual(issues.missingLinks, ["Jaksh's Father - Kartik"]);
assert.deepEqual(issues.extraLinks, ['Tilli']);
assert.deepEqual(issues.notInCast, ['Mailman']);
assert.deepEqual(issues.storyboardLine, ['Tilli', "Jaksh's Father - Kartik"]);
assert.deepEqual(issues.storyboardPanels, [{ panel: 2, beat: 2, missing: ['Jaksh', "Jaksh's Father - Kartik"], unplaced: [] }]);
assert.equal(check.fixableIssueCount(issues), 5);
assert.equal(check.storyboardNeedsFix(issues), true);
assert.equal(check.videoNeedsFix(issues), false);
assert.match(check.describeIssues(issues).join('\n'), /Jaksh's Father - Kartik is in the script but not attached/);
assert.match(check.describeIssues(issues).join('\n'), /Storyboard panel 2 \(beat 2\) does not name Jaksh and Jaksh's Father - Kartik\./);
assert.match(check.describeWarnings(issues).join('\n'), /Tilli is attached but on screen in none/);
assert.match(check.describeWarnings(issues).join('\n'), /Mailman is on screen but not in the episode cast/);

// The Characters line is rewritten in place; a prompt without one gets it before the Setting line.
const linked = ['Jaksh', "Jaksh's Father - Kartik"];
const relined = check.withCharactersLine(storyboard, linked);
assert.match(relined, /^Characters: Jaksh, Jaksh's Father - Kartik\. Each appears as exactly one individual/m);
assert.equal(relined.split('Characters:').length, 2);
assert.match(check.withCharactersLine('Style.\n\nSetting: Shed.', ['Jaksh']), /Style\.\n\nCharacters: Jaksh\. .*\n\nSetting: Shed\./);
assert.match(check.withCharactersLine(storyboard, []), /^Characters: None\.$/m);

issues = check.findCharacterIssues({ beats, linked, storyboardPrompt: relined, videoPrompt: null });
assert.deepEqual(issues.storyboardLine, []);
assert.equal(issues.storyboardPanels.length, 1);

// Named without a place is still a problem: bodies merge and characters drift without one.
const namedOnly = relined.replace('Panel 2: Close-up, eye level — a hammer on the bench.', "Panel 2: Medium shot, eye level — Jaksh's Father - Kartik hands Jaksh a hammer.");
issues = check.findCharacterIssues({ beats, linked, storyboardPrompt: namedOnly, videoPrompt: null });
assert.deepEqual(issues.storyboardPanels, [{ panel: 2, beat: 2, missing: [], unplaced: ['Jaksh', "Jaksh's Father - Kartik"] }]);
assert.match(check.describeIssues(issues).join('\n'), /Storyboard panel 2 \(beat 2\) does not say where Jaksh and Jaksh's Father - Kartik are in frame\./);
const fixedPanels = relined.replace('Panel 2: Close-up, eye level — a hammer on the bench.', "Panel 2: Medium shot, eye level — Jaksh's Father - Kartik (right, midground, standing, facing left) hands Jaksh (left, foreground, standing, facing right) a hammer.");
issues = check.findCharacterIssues({ beats, linked, storyboardPrompt: fixedPanels, videoPrompt: null });
assert.equal(check.fixableIssueCount(issues), 0);

// Short names in a panel that should show the character become the exact name, in code.
const shortNamed = relined.replace('Panel 2: Close-up, eye level — a hammer on the bench.', 'Panel 2: Medium shot, eye level — Kartik (right, midground, standing) hands Jaksh (left, foreground, standing) a hammer; Kartik smiles.');
const exact = check.withExactNames(shortNamed, beats, cast);
assert.match(exact, /Panel 2: Medium shot, eye level — Jaksh's Father - Kartik \(right, midground, standing\) hands Jaksh \(left, foreground, standing\) a hammer; Jaksh's Father - Kartik smiles\./);
assert.equal(check.fixableIssueCount(check.findCharacterIssues({ beats, linked, storyboardPrompt: exact, videoPrompt: null })), 0);
// A panel that names a cast member by a short name gets the exact name even when its beat does not list them.
assert.equal(check.withExactNames(shortNamed, [beats[0], { beat: 2, onScreen: ['Jaksh'], notInCast: [] }], cast), exact);
// A text with no cast names is left alone.
assert.equal(check.withExactNames(storyboard, beats, cast), storyboard);
assert.match(check.withExactNames('Characters: Kartik.\n\nShot: Wide shot — Kartik (left) waves.', [{ beat: 1, onScreen: ["Jaksh's Father - Kartik"], notInCast: [] }], cast),
  /^Characters: Kartik\.\n\nShot: Wide shot — Jaksh's Father - Kartik \(left\) waves\.$/);

// An older single-frame prompt has no panels and is checked as a whole.
const single = 'Create a single full-frame 3D animation frame.\n\nCharacters: Jaksh.\n\nShot: Medium shot — Jaksh waves.';
issues = check.findCharacterIssues({ beats: [beats[1]], linked, storyboardPrompt: single, videoPrompt: null });
assert.deepEqual(issues.storyboardPanels, [{ panel: 1, beat: 2, missing: ["Jaksh's Father - Kartik"], unplaced: ['Jaksh'] }]);
assert.match(check.buildStoryboardRevisionPrompt({ storyboardPrompt: single, scriptBeats: '', panels: issues.storyboardPanels }), /- The shot \(beat 2\): name and place "Jaksh's Father - Kartik"; place "Jaksh"\./);
const revision = check.buildStoryboardRevisionPrompt({ storyboardPrompt: relined, scriptBeats: '', panels: [{ panel: 2, beat: 2, missing: ['Jaksh'], unplaced: [] }] });
assert.match(revision, /- Panel 2 \(beat 2\): name and place "Jaksh"\./);
assert.match(revision, /replace those words with the exact name/);
assert.match(revision, /"Jaksh \(left, foreground, kneeling, facing right\)"/);

// Video shots: each shot names and places who its beat shows, and attaches every linked sheet.
const shotPrompt = (attached, action, placement) => shots.buildShotPrompt({
  panel: 1, isGrid: true, seconds: 5, lighting: 'Warm light', camera: 'Medium shot, eye level, static (locked-off)',
  action, dialogue: '', dialogueWords: 0, characterNames: attached, locationName: 'Workshop', placement,
});
const plan = (prompts) => shots.serializeShotPlan({ format: shots.SHOT_PLAN_FORMAT, shots: prompts.map((prompt, index) => ({
  shot: index + 1, beat: index + 1, title: '', seconds: 5, neededSeconds: 5, dialogueWords: 0, prompt,
})) });
issues = check.findCharacterIssues({
  beats, linked, storyboardPrompt: fixedPanels,
  videoPrompt: plan([shotPrompt(['Jaksh'], 'Jaksh opens the door.'), shotPrompt(['Jaksh'], 'Jaksh takes the hammer.')]),
});
assert.deepEqual(issues.videoAttachments, ["Jaksh's Father - Kartik"]);
assert.deepEqual(issues.videoShots, [
  { shot: 1, beat: 1, missing: [], unplaced: ['Jaksh'] },
  { shot: 2, beat: 2, missing: ["Jaksh's Father - Kartik"], unplaced: ['Jaksh'] },
]);
assert.equal(check.videoNeedsFix(issues), true);
const placedPlan = plan([
  shotPrompt(linked, 'Jaksh opens the door.', 'Jaksh: left, midground, standing, facing right'),
  shotPrompt(linked, "Jaksh's Father - Kartik hands Jaksh the hammer.", "Jaksh's Father - Kartik: right, midground, standing, facing left; Jaksh: left, foreground, standing, facing right."),
]);
issues = check.findCharacterIssues({ beats, linked, storyboardPrompt: fixedPanels, videoPrompt: placedPlan });
assert.equal(check.fixableIssueCount(issues), 0);

// A revision keeps the panel layout: no panels added to a single frame, none dropped from a grid.
assert.equal(check.parseRevisedStoryboardPrompt({ storyboard_prompt: '  New prompt. ' }, single), 'New prompt.');
assert.throws(() => check.parseRevisedStoryboardPrompt({}, single), /missing/);
assert.throws(() => check.parseRevisedStoryboardPrompt({ storyboard_prompt: 'Panel 8 — Shot: Medium shot.' }, single), /panel layout/);
assert.throws(() => check.parseRevisedStoryboardPrompt({ storyboard_prompt: relined.replace(/\n\nPanel 4:.*$/m, '') }, relined), /panel layout/);
assert.equal(check.parseRevisedStoryboardPrompt({ storyboard_prompt: fixedPanels }, relined), fixedPanels.trim());

// Beat numbers come from the beat headers, or from the scene for a beat saved without one.
assert.deepEqual(check.checkedBeatNumbers({ scriptBeats: '### BEAT 7\n**[ACTION]** A.\n\n### BEAT 8\n**[ACTION]** B.', description: '' }), [7, 8]);
assert.deepEqual(check.checkedBeatNumbers({ scriptBeats: '**[ACTION]** A.', beatNumbers: [12], description: '' }), [12]);

// The shot director is told who each beat shows, and where its storyboard frame put them.
const direction = shots.buildShotDirectionPrompt({
  locationName: 'Workshop', characterNames: linked, scriptBeats: '### BEAT 1\n**[ACTION]** A.\n\n### BEAT 2\n**[ACTION]** B.',
  description: '', beatCast: { 1: ['Jaksh'], 2: [] }, storyboardPrompt: fixedPanels,
});
assert.match(direction, /ON SCREEN IN EACH BEAT \(name every one of them in that beat's "action" and "placement", by exact name\):\n- Beat 1: "Jaksh"\n/);
assert.match(direction, /STORYBOARD OPENING FRAMES[^\n]*\n- Beat 1: Medium shot, eye level — Jaksh \(left, midground, standing, facing right\) stands at the door\.\n- Beat 2: Medium shot, eye level — Jaksh's Father - Kartik \(right/);
assert.match(direction, /"placement" — where every character in the shot is at its first frame/);
assert.doesNotMatch(shots.buildShotDirectionPrompt({ locationName: '', characterNames: [], scriptBeats: 'x', description: '' }), /ON SCREEN|OPENING FRAMES/);
assert.match(shots.buildShotDirectionPrompt({ locationName: '', characterNames: [], scriptBeats: '### BEAT 4\n**[ACTION]** x', description: '', storyboardPrompt: single }), /- Beat 4: Medium shot — Jaksh waves\./);

// The placement becomes the clip's "Positions at 0:00" line; "none" or nothing leaves it out.
const placed = shotPrompt(linked, 'Jaksh waves.', 'Jaksh: left, foreground, standing, facing right;');
assert.match(placed, /\n\nPositions at 0:00 — Jaksh: left, foreground, standing, facing right\. Each character keeps one body with fixed proportions, stays in this place unless the action moves them, and never appears, vanishes, duplicates or swaps places\.\n\nShot 1 \[0:00/);
assert.doesNotMatch(shotPrompt(linked, 'The door opens.', 'none'), /Positions/);
assert.doesNotMatch(shotPrompt(linked, 'The door opens.'), /Positions|\n\n\n/);
const directed = shots.buildShotPlan(
  { locationName: 'Workshop', characterNames: ['Jaksh'], scriptBeats: '### BEAT 5\n**[ACTION]** Jaksh waves.', description: '', storyboardPrompt: 'A 2x2 grid.' },
  shots.validateShotDirection({ lighting: 'Warm light', shots: [{ beat_number: 5, camera: 'Medium shot, eye level, static (locked-off)', action: 'Jaksh waves.', placement: 'Jaksh: center, midground, standing, facing camera' }] }, shots.sceneBeats({ scriptBeats: '### BEAT 5\n**[ACTION]** Jaksh waves.', description: '' })),
);
assert.match(directed.shots[0].prompt, /Positions at 0:00 — Jaksh: center, midground, standing, facing camera\./);
// Every sheet planned now is a 4-panel grid, a single beat included, so the clip opens on panel 1.
assert.match(directed.shots[0].prompt, /Use the panel numbered 1 in the attached storyboard grid/);
assert.throws(() => shots.validateShotDirection({ lighting: 'x', shots: [{ beat_number: 1, camera: 'c', action: 'a', placement: 3 }] }, [{ number: 1 }]), /incomplete/);

// Older single frames still read as one frame.
assert.equal(shots.storyboardIsGrid(1, 'Create a single 4-panel 3D animation panel grid, arranged in a 2x2 grid.'), true);
assert.equal(shots.storyboardIsGrid(1, 'Create a single full-frame 3D animation frame.'), false);
assert.equal(shots.storyboardIsGrid(1, ''), false);
assert.equal(shots.storyboardIsGrid(3, ''), true);

// Who is where carries across batches, so a character placed long ago is still known to be there.
const ledgerPrompt = check.buildCastCheckPrompt({
  cast, scriptBeats: '### BEAT 30\n**[ACTION]** Wide shot of the campfire.', beatNumbers: [30],
  whereabouts: [{ name: "Jaksh's Father - Kartik", place: 'Campsite, seated by the fire' }],
});
assert.match(ledgerPrompt, /WHO IS WHERE before these beats[^\n]*\n- "Jaksh's Father - Kartik": Campsite, seated by the fire\n\nBEATS TO DECIDE:/);
assert.match(ledgerPrompt, /Start from WHO IS WHERE: a character listed there is still in that place until the script moves them\./);
assert.match(ledgerPrompt, /"where_after": \[/);
assert.match(ledgerPrompt, /including those kept from WHO IS WHERE and not mentioned since/);
assert.doesNotMatch(check.buildCastCheckPrompt({ cast, scriptBeats: 'x', beatNumbers: [1] }), /WHO IS WHERE before|Start from WHO IS WHERE/);

// The agent's record is read by exact name (short names too); unknown names, empty places and repeats are dropped.
assert.deepEqual(check.parseWhereabouts({ where_after: [
  { name: 'Kartik', place: '  Campsite,\n by the fire ' },
  { name: 'Mailman', place: 'Gate' },
  { name: 'Tilli', place: '' },
  { name: "Jaksh's Father - Kartik", place: 'Tent' },
  { name: 'jaksh', place: 'Pond edge' },
  'nonsense',
] }, cast), [
  { name: "Jaksh's Father - Kartik", place: 'Campsite, by the fire' },
  { name: 'Jaksh', place: 'Pond edge' },
]);
assert.deepEqual(check.parseWhereabouts({}, cast), []);
assert.deepEqual(check.parseWhereabouts(null, cast), []);

// Newer records win; anyone only an older record knew about is kept.
assert.deepEqual(check.mergeWhereabouts(
  [{ name: 'Jaksh', place: 'Pond edge' }],
  [{ name: 'Jaksh', place: 'Campsite' }, { name: 'Tilli', place: 'Pond edge' }],
  [{ name: "Jaksh's Father - Kartik", place: 'Campsite, by the fire' }, { name: 'Tilli', place: 'Tent' }],
), [
  { name: 'Jaksh', place: 'Pond edge' },
  { name: 'Tilli', place: 'Pond edge' },
  { name: "Jaksh's Father - Kartik", place: 'Campsite, by the fire' },
]);

// Episode 5, scene 1: the panels draw Tilli in the jeep, but Tilli is neither attached nor in the
// Characters line. Whatever the reads decided, the drawn character is attached and listed.
const familyCast = [...cast, { name: "Jaksh's Mother - Sonal" }];
const jeepPrompt = [
  "Characters: Jaksh, Jaksh's Father - Kartik, Jaksh's Mother - Sonal. Each appears as exactly one individual.",
  '',
  "Panel 1: Wide shot, eye level — Jaksh's Father - Kartik (left, midground, seated, facing right) steers; Jaksh (left, background, rear seat, facing forward) asks; Tilli (right, background, rear seat, facing forward) looks ahead.",
  '',
  'Panel 2: Wide shot, high angle — Sonal (right, foreground, seated, facing away) and Tilli (center-right, midground, standing in jeep, facing down) look at the oasis.',
].join('\n');
issues = check.findCharacterIssues({
  beats: [{ beat: 1, onScreen: ["Jaksh's Father - Kartik", 'Jaksh'], notInCast: [] }, { beat: 2, onScreen: [], notInCast: [] }],
  linked: ["Jaksh's Father - Kartik", "Jaksh's Mother - Sonal", 'Jaksh'],
  storyboardPrompt: jeepPrompt,
  cast: familyCast,
});
assert.deepEqual(issues.missingLinks, ['Tilli']);
assert.deepEqual(issues.storyboardLine, ['Tilli']);
assert.deepEqual(issues.extraLinks, []);
// Without the cast, only what the reads decided counts (the old behaviour that missed Tilli).
assert.deepEqual(check.findCharacterIssues({
  beats: [{ beat: 1, onScreen: ['Jaksh'], notInCast: [] }], linked: ['Jaksh'], storyboardPrompt: jeepPrompt,
}).missingLinks, []);
// The vehicle rule now keeps a travelling family together in wide shots.
assert.match(check.buildCastCheckPrompt({ cast, scriptBeats: 'x', beatNumbers: [1] }), /travelling together in a vehicle .* are all shown whenever the vehicle is in frame and anyone in it acts or speaks, wide shots included/);

// Spare panels use exact names too: a short name in any panel is flagged and swapped.
const spareShort = jeepPrompt + "\n\nPanel 3: (spare) Medium wide shot — Kartik (left, midground, facing right) grips the wheel; Sonal (right, midground, facing left) smiles.";
issues = check.findCharacterIssues({
  beats: [{ beat: 1, onScreen: ["Jaksh's Father - Kartik", 'Jaksh', 'Tilli'], notInCast: [] }, { beat: 2, onScreen: ['Tilli'], notInCast: [] }],
  linked: ["Jaksh's Father - Kartik", "Jaksh's Mother - Sonal", 'Jaksh', 'Tilli'],
  storyboardPrompt: spareShort,
  cast: familyCast,
});
assert.deepEqual(issues.storyboardShortNames, [
  { panel: 2, names: ["Jaksh's Mother - Sonal"] },
  { panel: 3, names: ["Jaksh's Father - Kartik", "Jaksh's Mother - Sonal"] },
]);
assert.equal(check.storyboardNeedsFix(issues), true);
assert.match(check.describeIssues(issues).join('\n'), /Storyboard panel 3 calls Jaksh's Father - Kartik and Jaksh's Mother - Sonal by a short name\./);
const exactEverywhere = check.withExactNames(spareShort, [{ beat: 1, onScreen: [], notInCast: [] }, { beat: 2, onScreen: [], notInCast: [] }], familyCast);
assert.match(exactEverywhere, /Panel 3: \(spare\) Medium wide shot — Jaksh's Father - Kartik \(left, midground, facing right\) grips the wheel; Jaksh's Mother - Sonal \(right, midground, facing left\) smiles\./);
assert.match(exactEverywhere, /Panel 2: Wide shot, high angle — Jaksh's Mother - Sonal \(right/);
assert.deepEqual(check.findCharacterIssues({ beats: [], linked: [], storyboardPrompt: exactEverywhere, cast: familyCast }).storyboardShortNames, []);
// Without the cast nothing is flagged.
assert.deepEqual(check.findCharacterIssues({ beats: [], linked: [], storyboardPrompt: spareShort }).storyboardShortNames, []);

console.log('character-continuity: ok');
