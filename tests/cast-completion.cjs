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
const { buildCastCompletionPrompt, parseCastDecisions } = load('src/lib/castCompletion.ts', { '@/lib/characterNames': names });

const library = [
  { id: 'j', name: 'Jaksh', description: 'A boy.' },
  { id: 'k', name: "Jaksh's Father - Kartik", description: 'Jaksh\'s father.' },
  { id: 's', name: "Jaksh's Mother - Sonal", description: 'Jaksh\'s mother.' },
];

const prompt = buildCastCompletionPrompt({ names: ['Dad', 'Camel Seller'], library, story: '<p>Dad <b>waves</b>.</p>' });
assert.match(prompt, /- "Dad"\n- "Camel Seller"/);
assert.match(prompt, /- "Jaksh's Father - Kartik": Jaksh's father\./);
assert.match(prompt, /Dad waves \./);

const decisions = parseCastDecisions({ characters: [
  // The agent maps a role name to the library.
  { name: 'Dad', library_name: "Jaksh's Father - Kartik" },
  // A shortened name the agent wrongly calls new is still attached, never duplicated.
  { name: 'Sonal', library_name: null, description: 'A woman in a cream top.' },
  // A made-up library name is ignored; with a description it is created.
  { name: 'Camel Seller', library_name: 'The Camel Seller', description: 'An old man in a white kandura.' },
  { name: 'Crowd', skip: true },
  // No description: nothing to draw a sheet from, so it is left out.
  { name: 'Shopkeeper' },
] }, ['Dad', 'Sonal', 'Camel Seller', 'Crowd', 'Shopkeeper', 'Ghost'], library);

assert.deepEqual(decisions.map((decision) => [decision.name, decision.action, decision.character?.name ?? decision.description ?? null]), [
  ['Dad', 'attach', "Jaksh's Father - Kartik"],
  ['Sonal', 'attach', "Jaksh's Mother - Sonal"],
  ['Camel Seller', 'create', 'An old man in a white kandura.'],
  ['Crowd', 'skip', null],
  ['Shopkeeper', 'skip', null],
  // Missing from the answer entirely.
  ['Ghost', 'skip', null],
]);
assert.throws(() => parseCastDecisions({}, ['Dad'], library));

console.log('Cast completion: prompt, library matching, no duplicates, creation and skips passed.');
