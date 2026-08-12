import { cp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '..');
const defaultSource = join(repositoryRoot, 'packages', 'vscodePlugin');

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index === -1 || !process.argv[index + 1]) {
    return undefined;
  }
  return process.argv[index + 1];
}

function isDescendant(parent, candidate) {
  const path = relative(parent, candidate);
  return path !== '' && path !== '..' && !path.startsWith(`..${sep}`) && !path.includes(`..${sep}`);
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function main() {
  const source = resolve(argument('--source') ?? defaultSource);
  const stageArgument = argument('--out');
  if (!stageArgument) {
    throw new Error('Usage: node scripts/stage-vscode-plugin-marketplace.mjs --out <empty staging directory> [--source <plugin directory>]');
  }

  const stagingDirectory = resolve(stageArgument);
  if (
    stagingDirectory === source ||
    isDescendant(source, stagingDirectory) ||
    isDescendant(stagingDirectory, source)
  ) {
    throw new Error('The staging directory must be separate from the source plugin directory');
  }

  try {
    await stat(stagingDirectory);
    throw new Error(`Refusing to overwrite an existing staging directory: ${stagingDirectory}`);
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }

  const sourcePackage = await readJson(join(source, 'package.json'));
  if (sourcePackage.name !== 'cherry-markdown-vscode-plugin') {
    throw new Error('The source extension manifest must retain the internal workspace name');
  }

  await mkdir(dirname(stagingDirectory), { recursive: true });
  await cp(source, stagingDirectory, {
    recursive: true,
    filter(path) {
      const entry = relative(source, path);
      const firstSegment = entry.split(sep)[0];
      return !['.git', '.vscode-test', 'node_modules', 'tools'].includes(firstSegment) && !entry.endsWith('.vsix');
    },
  });

  // The source manifest remains untouched. The staging copy carries the
  // Marketplace identity and removes prepublish so vsce cannot start an
  // unreviewed source build after the verified archive inputs were prepared.
  const stagedPackage = { ...sourcePackage, name: 'cherry-markdown' };
  if (stagedPackage.scripts) {
    stagedPackage.scripts = { ...stagedPackage.scripts };
    delete stagedPackage.scripts['vscode:prepublish'];
  }
  await writeFile(join(stagingDirectory, 'package.json'), `${JSON.stringify(stagedPackage, null, 2)}\n`, 'utf8');
  console.log(`Staged Marketplace manifest at ${stagingDirectory}.`);
}

await main();
