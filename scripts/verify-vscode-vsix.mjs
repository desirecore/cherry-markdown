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

async function listRuntimeJavaScript(directory, relativeDirectory = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await listRuntimeJavaScript(join(directory, entry.name), relativePath)));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(relativePath);
    }
  }
  return files.sort();
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

  const sourceExtensionDistDirectory = join(source, 'dist');
  const expectedExtensionRuntimeJavaScript = await listRuntimeJavaScript(sourceExtensionDistDirectory);
  if (!expectedExtensionRuntimeJavaScript.includes('extension.js')) {
    throw new Error('Extension Host runtime must include dist/extension.js');
  }
  const extensionDistPrefix = 'extension/dist/';
  const archivedExtensionDistEntries = [...files.keys()]
    .filter((path) => path.startsWith(extensionDistPrefix))
    .map((path) => path.slice(extensionDistPrefix.length))
    .sort();
  const unexpectedExtensionDistEntries = archivedExtensionDistEntries.filter((path) => !path.endsWith('.js'));
  if (unexpectedExtensionDistEntries.length > 0) {
    throw new Error(
      `VSIX Extension Host dist must not contain non-runtime or source-map files: ${unexpectedExtensionDistEntries.join(', ')}`,
    );
  }
  if (JSON.stringify(archivedExtensionDistEntries) !== JSON.stringify(expectedExtensionRuntimeJavaScript)) {
    throw new Error(
      `VSIX Extension Host runtime JavaScript set differs from the Rspack output: ${archivedExtensionDistEntries.join(', ')}`,
    );
  }
  for (const asset of expectedExtensionRuntimeJavaScript) {
    const expected = await readFile(join(sourceExtensionDistDirectory, asset));
    const archived = requireArchiveFile(files, `${extensionDistPrefix}${asset}`);
    if (!archived.equals(expected)) {
      throw new Error(`VSIX Extension Host runtime JavaScript does not byte-match the Rspack output: ${asset}`);
    }
  }

  const sourceDistDirectory = join(source, 'web-resources', 'dist');
  const sourceDistEntries = await readdir(sourceDistDirectory, { withFileTypes: true });
  const expectedRuntimeJavaScript = sourceDistEntries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
    .map((entry) => entry.name)
    .sort();
  if (!expectedRuntimeJavaScript.includes('index.js') || !expectedRuntimeJavaScript.includes('super-doc.js')) {
    throw new Error('Prepared VSIX runtime JavaScript must include index.js and super-doc.js');
  }
  const archivedRuntimeJavaScript = [...files.keys()]
    .filter((path) => {
      const prefix = 'extension/web-resources/dist/';
      const relativePath = path.slice(prefix.length);
      return path.startsWith(prefix) && !relativePath.includes('/') && relativePath.endsWith('.js');
    })
    .map((path) => path.slice('extension/web-resources/dist/'.length))
    .sort();
  if (JSON.stringify(archivedRuntimeJavaScript) !== JSON.stringify(expectedRuntimeJavaScript)) {
    throw new Error(
      `VSIX runtime JavaScript set differs from the prepared assets: ${archivedRuntimeJavaScript.join(', ')}`,
    );
  }
  for (const asset of expectedRuntimeJavaScript) {
    const expected = await readFile(join(sourceDistDirectory, asset));
    const archived = requireArchiveFile(files, `extension/web-resources/dist/${asset}`);
    if (!archived.equals(expected)) {
      throw new Error(`VSIX runtime JavaScript does not byte-match the prepared asset: ${asset}`);
    }
  }

  for (const asset of ['super-doc.min.css', '.super-doc-release.json']) {
    const expected = await readFile(join(source, 'web-resources', 'dist', asset));
    const archived = requireArchiveFile(files, `extension/web-resources/dist/${asset}`);
    if (!archived.equals(expected)) {
      throw new Error(`VSIX asset does not byte-match the reviewed prepared asset: ${asset}`);
    }
  }

  const staticRuntimeAssets = [
    'favicon.ico',
    'web-resources/index.css',
    'web-resources/scripts/index.css',
    'web-resources/scripts/pinyin/pinyin_dist.js',
  ];
  const sourceRootEntries = await readdir(source, { withFileTypes: true });
  const packageNlsFiles = sourceRootEntries
    .filter((entry) => entry.isFile() && /^package\.nls(?:\..+)?\.json$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  if (packageNlsFiles.length === 0) {
    throw new Error('The source extension must contain package.nls localization files');
  }
  for (const asset of [...staticRuntimeAssets, ...packageNlsFiles]) {
    const expected = await readFile(join(source, asset));
    const archived = requireArchiveFile(files, `extension/${asset}`);
    if (!archived.equals(expected)) {
      throw new Error(`VSIX static runtime asset does not byte-match the source: ${asset}`);
    }
  }

  if (sourcePackage.l10n !== './l10n') {
    throw new Error('The VSIX verifier expects the extension manifest l10n directory to remain ./l10n');
  }
  const sourceL10nDirectory = join(source, 'l10n');
  const sourceL10nEntries = await readdir(sourceL10nDirectory, { withFileTypes: true });
  if (sourceL10nEntries.length === 0 || sourceL10nEntries.some((entry) => !entry.isFile())) {
    throw new Error('Extension l10n resources must be a non-empty flat directory');
  }
  const expectedL10nFiles = sourceL10nEntries.map((entry) => entry.name).sort();
  const archivedL10nFiles = [...files.keys()]
    .filter((path) => path.startsWith('extension/l10n/'))
    .map((path) => path.slice('extension/l10n/'.length))
    .sort();
  if (JSON.stringify(archivedL10nFiles) !== JSON.stringify(expectedL10nFiles)) {
    throw new Error(`VSIX l10n file set differs from source: ${archivedL10nFiles.join(', ')}`);
  }
  for (const file of expectedL10nFiles) {
    const expected = await readFile(join(sourceL10nDirectory, file));
    const archived = requireArchiveFile(files, `extension/l10n/${file}`);
    if (!archived.equals(expected)) {
      throw new Error(`VSIX l10n resource does not byte-match the source: ${file}`);
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
