import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'));

const requiredFiles = [
  'dist/super-doc.js',
  'dist/super-doc.esm.js',
  'dist/super-doc.core.js',
  'dist/super-doc.engine.js',
  'dist/super-doc.engine.esm.js',
  'dist/super-doc.engine.core.js',
  'dist/super-doc.engine.core.esm.js',
  'dist/super-doc.engine.core.d.ts',
  'dist/super-doc.engine.core.esm.d.ts',
  'dist/super-doc.stream.js',
  'dist/super-doc.stream.esm.js',
  'dist/super-doc.wysiwyg.js',
  'dist/super-doc.wysiwyg.esm.js',
  'dist/super-doc.css',
  'dist/super-doc.min.css',
  'dist/super-doc.markdown.css',
  'dist/super-doc.markdown.min.css',
  'dist/fonts/ch-icon.woff',
  packageJson.types.replace(/^\.\//, ''),
];

function findAddonEntries(directory, relativeDirectory = '') {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = join(relativeDirectory, entry.name);
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      return findAddonEntries(fullPath, relativePath);
    }
    return entry.isFile() && entry.name.endsWith('-plugin.js') ? [relativePath] : [];
  });
}

const addonEntries = findAddonEntries(join(packageDir, 'src/addons'));
addonEntries.forEach((entry) => {
  const outputBase = `dist/addons/${entry.replace(/\.js$/, '')}`;
  requiredFiles.push(`${outputBase}.js`, `${outputBase}.esm.js`);
});

const missingFiles = requiredFiles.filter((relativePath) => {
  const fullPath = join(packageDir, relativePath);
  return !existsSync(fullPath) || statSync(fullPath).size === 0;
});

if (missingFiles.length > 0) {
  console.error('Build output verification failed. Missing or empty files:');
  missingFiles.forEach((relativePath) => console.error(`- ${relativePath}`));
  process.exitCode = 1;
} else {
  console.log(`Verified ${requiredFiles.length} release artifacts.`);
}
