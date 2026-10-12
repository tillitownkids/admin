const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const source = readFileSync(resolve(__dirname, '../src/lib/characterNames.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 } }).outputText;
const exported = {};
new Function('exports', compiled)(exported);
const { findExistingByName } = exported;

// The character library as it is in production.
const library = [
  'Jaksh', 'Tilli', 'Nimo the Bellbird', "Jaksh's Father - Kartik", "Jaksh's Mother - Sonal",
  'Wise Turtle', 'The Silver Star', 'The Moon',
].map((name, index) => ({ id: `c${index}`, name }));
const find = (name) => findExistingByName(name, library)?.name ?? null;

// Exact names, ignoring case and spacing.
assert.equal(find('Jaksh'), 'Jaksh');
assert.equal(find('  tilli '), 'Tilli');
assert.equal(find("jaksh's father -  kartik"), "Jaksh's Father - Kartik");

// The duplicates found on 2026-10-12: shortened names now resolve to the library entry.
assert.equal(find('Kartik'), "Jaksh's Father - Kartik");
assert.equal(find('Sonal'), "Jaksh's Mother - Sonal");
assert.equal(find("Jaksh's Father"), "Jaksh's Father - Kartik");
assert.equal(find('Nimo'), 'Nimo the Bellbird');
assert.equal(find('Moon'), 'The Moon');
assert.equal(find('Silver Star'), 'The Silver Star');

// "Jaksh" stays Jaksh, not his father: an exact name always wins.
assert.equal(find('JAKSH'), 'Jaksh');

// Genuinely new names stay new.
assert.equal(find('Grandma Asha'), null);
assert.equal(find('Kartik Uncle Raj'), null);
assert.equal(find('The'), null);
assert.equal(find(''), null);

// A word that fits more than one entry is left for a person to decide.
const ambiguous = [{ name: 'Red Car' }, { name: 'Red Kite' }];
assert.equal(findExistingByName('Red', ambiguous), null);
assert.equal(findExistingByName('Car', ambiguous)?.name, 'Red Car');

console.log('Character names: exact matches, shortened names, new names and ambiguous names passed.');
