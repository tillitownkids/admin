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
const { buildAssetDetectionPrompt, parseAssetDecisions, MAX_DETECTED_ASSETS } = load('src/lib/assetDetection.ts', { '@/lib/characterNames': names });

const library = [
  { id: 'j', name: 'Jaksh', description: 'A boy.' },
  { id: 'k', name: "Jaksh's Father - Kartik", description: 'Father.' },
  { id: 'n', name: 'Nimo the Bellbird', description: 'A bird.' },
];

const characterPrompt = buildAssetDetectionPrompt('character', '<p>Jaksh and <b>Dad</b> set off.</p>', library);
assert.match(characterPrompt, /List every character who appears/);
assert.match(characterPrompt, /CHARACTER LIBRARY/);
assert.match(characterPrompt, /- "Jaksh's Father - Kartik": Father\./);
assert.match(characterPrompt, /Jaksh and Dad set off\./);
const locationPrompt = buildAssetDetectionPrompt('location', 'Story.', []);
assert.match(locationPrompt, /every distinct physical location/);
assert.match(locationPrompt, /LOCATION LIBRARY \(every location the series already has\):\nNone yet\./);

const decisions = parseAssetDecisions({ items: [
  { name: 'Jaksh', library_name: 'Jaksh' },
  { name: 'Dad', library_name: "Jaksh's Father - Kartik" },
  // Said to be new, but the name fits a library entry: attached, never duplicated.
  { name: 'Nimo', library_name: null, description: 'A small blue bird.' },
  // A library name that does not exist is ignored.
  { name: 'Camel Seller', library_name: 'The Camel Seller', description: 'An old man in a white kandura.' },
  // The same library character twice is attached once.
  { name: 'Kartik', library_name: "Jaksh's Father - Kartik" },
  // New with no description: nothing to make a sheet from, so dropped.
  { name: 'Shopkeeper' },
  { name: '  ' },
] }, library);
assert.deepEqual(decisions.map((d) => [d.name, d.action, d.asset?.name ?? d.description]), [
  ['Jaksh', 'attach', 'Jaksh'],
  ['Dad', 'attach', "Jaksh's Father - Kartik"],
  ['Nimo', 'attach', 'Nimo the Bellbird'],
  ['Camel Seller', 'create', 'An old man in a white kandura.'],
]);
assert.throws(() => parseAssetDecisions({ characters: [] }, library));
const many = { items: Array.from({ length: 20 }, (_, i) => ({ name: `Place ${i}`, description: 'x' })) };
assert.equal(parseAssetDecisions(many, []).length, MAX_DETECTED_ASSETS);

console.log('Asset detection: prompts, library matching, no duplicates, creation and limits passed.');
