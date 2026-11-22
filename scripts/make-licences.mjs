// Builds src/features/settings/licence-texts.json for the Open-source licences screen:
// the full licence texts Voxa ships under, and the app's runtime JavaScript packages with their
// copyright lines, read from node_modules. Run after adding or updating a dependency:
//
//   node scripts/make-licences.mjs
//
// Models and native libraries are listed by hand in src/features/settings/licences.ts.
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const nm = (...p) => join(root, 'node_modules', ...p);

// Build-time or development-only packages: not inside the app people install.
const SKIP = new Set(['eslint-config-expo', 'expo-build-properties', 'expo-dev-client']);
// Runtime packages that come in through expo and end up in the app.
const EXTRA = ['expo-modules-core', 'expo-asset', 'expo-keep-awake', '@react-navigation/native', '@react-navigation/native-stack'];

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const names = [...Object.keys(pkg.dependencies).filter((n) => !SKIP.has(n)), ...EXTRA.filter((n) => existsSync(nm(n, 'package.json')))];

function licenceFile(dir) {
  const f = readdirSync(dir).find((n) => /^licen[cs]e(\.md|\.txt)?$/i.test(n));
  return f ? readFileSync(join(dir, f), 'utf8') : null;
}

const packages = names.sort().map((name) => {
  const dir = nm(name);
  const meta = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  // The Inter package wraps the font: the font's own notice is in LICENSE_FONT.
  const text = (name === '@expo-google-fonts/inter' ? readFileSync(join(dir, 'LICENSE_FONT'), 'utf8') : '') || licenceFile(dir) || '';
  const copyright = [...new Set(text.split('\n').map((l) => l.trim()).filter((l) => /^copyright\s+(\(c\)|©|\d|\[)/i.test(l)))];
  return {
    name,
    version: meta.version,
    licence: name === '@expo-google-fonts/inter' ? 'OFL-1.1' : String(meta.license ?? 'Unknown'),
    copyright: copyright.length ? copyright : [`${typeof meta.author === 'string' ? meta.author : (meta.author?.name ?? name)} and contributors`],
  };
});

const mitTemplate = readFileSync(nm('expo', 'LICENSE'), 'utf8')
  .split('\n')
  .filter((l) => !/^copyright\b/i.test(l.trim()))
  .join('\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

const texts = {
  MIT: mitTemplate,
  'Apache-2.0': readFileSync(nm('@eslint', 'core', 'LICENSE'), 'utf8').trim(),
  'OFL-1.1': readFileSync(nm('@expo-google-fonts', 'inter', 'LICENSE_FONT'), 'utf8').trim(),
  // From https://github.com/cmusphinx/cmudict (LICENSE), saved in scripts/licences.
  CMUdict: readFileSync(join(root, 'scripts', 'licences', 'cmudict.txt'), 'utf8').trim(),
};
if (!texts['Apache-2.0'].includes('Apache License') || !texts.MIT.includes('MIT License')) {
  throw new Error('A licence text source changed: check scripts/make-licences.mjs');
}
const unknown = packages.filter((p) => !(p.licence in texts));
if (unknown.length) throw new Error(`No licence text for: ${unknown.map((p) => `${p.name} (${p.licence})`).join(', ')}`);

const out = join(root, 'src', 'features', 'settings', 'licence-texts.json');
writeFileSync(out, JSON.stringify({ texts, packages }, null, 2) + '\n');
console.log(`Wrote ${packages.length} packages and ${Object.keys(texts).length} licence texts to ${out}`);
