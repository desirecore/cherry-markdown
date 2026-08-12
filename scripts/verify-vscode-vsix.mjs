import { readdir, readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '..');
const defaultSource = join(repositoryRoot, 'packages', 'vscodePlugin');
const toolingPackage = join(defaultSource, 'tools', 'package.json');
const require = createRequire(toolingPackage);
const { readZip } = require('@vscode/vsce/out/zip.js');
const vscePackage = require('@vscode/vsce/package.json');
const expectedVsceVersion = '2.22.0';

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index === -1 || !process.argv[index + 1]) {
    return undefined;
  }
  return process.argv[index + 1];
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function requireArchiveFile(files, path) {
  const content = files.get(path.toLowerCase());
  if (!content || content.length === 0) {
    throw new Error(`VSIX is missing required non-empty file: ${path}`);
  }
  return content;
}

async function main() {
  if (vscePackage.version !== expectedVsceVersion) {
    throw new Error(`VSIX verifier requires @vscode/vsce@${expectedVsceVersion}, found ${vscePackage.version}`);
  }

  const archiveArgument = argument('--archive');
  if (!archiveArgument) {
    throw new Error('Usage: node scripts/verify-vscode-vsix.mjs --archive <file.vsix> [--source <plugin directory>]');
  }
  const archive = resolve(archiveArgument);
  const source = resolve(argument('--source') ?? defaultSource);
  await stat(archive);

  const sourcePackage = await readJson(join(source, 'package.json'));
  if (sourcePackage.name !== 'cherry-markdown-vscode-plugin') {
    throw new Error('The source extension manifest name changed; Marketplace renaming must be staging-only');
  }

  const files = await readZip(archive, () => true);
  const extensionPackage = JSON.parse(requireArchiveFile(files, 'extension/package.json').toString('utf8'));
  if (extensionPackage.name !== 'cherry-markdown') {
    throw new Error('The packaged extension must use the Marketplace name cherry-markdown');
  }
  if (extensionPackage.publisher !== sourcePackage.publisher || extensionPackage.version !== sourcePackage.version) {
    throw new Error('The packaged extension publisher or version differs from the source manifest');
  }

  for (const requiredPath of [
    'extension.vsixmanifest',
    'extension/dist/extension.js',
    'extension/web-resources/dist/index.js',
    'extension/web-resources/dist/super-doc.js',
    'extension/web-resources/dist/super-doc.min.css',
    'extension/web-resources/dist/fonts/ch-icon.woff',
    'extension/web-resources/dist/fonts/ch-icon.woff2',
    'extension/web-resources/dist/.super-doc-release.json',
  ]) {
    requireArchiveFile(files, requiredPath);
  }

  for (const asset of ['super-doc.js', 'super-doc.min.css', '.super-doc-release.json']) {
    const expected = await readFile(join(source, 'web-resources', 'dist', asset));
    const archived = requireArchiveFile(files, `extension/web-resources/dist/${asset}`);
    if (!archived.equals(expected)) {
      throw new Error(`VSIX asset does not byte-match the reviewed prepared asset: ${asset}`);
    }
  }

  const sourceFontsDirectory = join(source, 'web-resources', 'dist', 'fonts');
  const sourceFonts = await readdir(sourceFontsDirectory, { withFileTypes: true });
  if (sourceFonts.length === 0 || sourceFonts.some((entry) => !entry.isFile())) {
    throw new Error('Prepared SuperDoc fonts must be a non-empty flat directory');
  }
  const expectedFonts = sourceFonts.map((entry) => entry.name).sort();
  const archivedFonts = [...files.keys()]
    .filter((path) => path.startsWith('extension/web-resources/dist/fonts/'))
    .map((path) => path.slice('extension/web-resources/dist/fonts/'.length))
    .sort();
  if (JSON.stringify(archivedFonts) !== JSON.stringify(expectedFonts)) {
    throw new Error(`VSIX font set differs from the reviewed prepared assets: ${archivedFonts.join(', ')}`);
  }
  for (const font of expectedFonts) {
    const expected = await readFile(join(sourceFontsDirectory, font));
    const archived = requireArchiveFile(files, `extension/web-resources/dist/fonts/${font}`);
    if (!archived.equals(expected)) {
      throw new Error(`VSIX font does not byte-match the reviewed prepared asset: ${font}`);
    }
  }

  const releaseMetadata = JSON.parse(
    requireArchiveFile(files, 'extension/web-resources/dist/.super-doc-release.json').toString('utf8'),
  );
  const expectedCoreVersion = sourcePackage.dependencies?.['@desirecore/super-doc'];
  if (
    releaseMetadata.name !== '@desirecore/super-doc' ||
    releaseMetadata.version !== expectedCoreVersion ||
    typeof releaseMetadata.integrity !== 'string' ||
    releaseMetadata.integrity.length === 0
  ) {
    throw new Error('The VSIX does not contain the reviewed SuperDoc release metadata');
  }

  const forbiddenEntries = [...files.keys()].filter(
    (path) =>
      path.startsWith('extension/src/') ||
      path.startsWith('extension/test/') ||
      path.startsWith('extension/tools/') ||
      path.startsWith('extension/node_modules/') ||
      path.startsWith('extension/.vscode/') ||
      path.endsWith('.map') ||
      path.endsWith('.d.ts') ||
      [
        'extension/web-resources/scripts/index.js',
        'extension/web-resources/scripts/editor-state.js',
        'extension/web-resources/scripts/export-limits.js',
      ].includes(path),
  );
  if (forbiddenEntries.length > 0) {
    throw new Error(`VSIX contains excluded development files: ${forbiddenEntries.join(', ')}`);
  }

  console.log(`Verified ${archive} with @vscode/vsce@${expectedVsceVersion}.`);
}

await main();
