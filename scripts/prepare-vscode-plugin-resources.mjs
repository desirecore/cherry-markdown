import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { execFile as execFileCallback } from 'node:child_process';

const execFile = promisify(execFileCallback);
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '..');
const pluginDirectory = join(repositoryRoot, 'packages', 'vscodePlugin');
const pluginPackagePath = join(pluginDirectory, 'package.json');
const outputDirectory = join(pluginDirectory, 'web-resources', 'dist');

// This is the integrity published for @desirecore/super-doc@0.2.15. Keeping it
// here makes a registry or metadata mismatch fail before any asset is copied.
const verifiedTarballs = new Map([
  ['0.2.15', 'sha512-eAeD6Xe7vvyLP3v419i9dv1Iub/+omURvDpCWjUt3zLjDvQVB0lIi3q1KEOgldTOHBSjTdgX3DzwQEme346KcQ=='],
]);

const requiredAssets = [
  'super-doc.js',
  'super-doc.min.css',
  'fonts/ch-icon.woff',
  'fonts/ch-icon.woff2',
];

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function assertNonEmptyFile(path, description) {
  const file = await stat(path);
  if (!file.isFile() || file.size === 0) {
    throw new Error(`${description} is missing or empty: ${path}`);
  }
}

async function main() {
  const pluginPackage = await readJson(pluginPackagePath);
  const version = pluginPackage.dependencies?.['@desirecore/super-doc'];

  if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) {
    throw new Error('packages/vscodePlugin/package.json must pin @desirecore/super-doc to an exact x.y.z version');
  }

  const expectedIntegrity = verifiedTarballs.get(version);
  if (!expectedIntegrity) {
    throw new Error(`No reviewed tarball integrity is recorded for @desirecore/super-doc@${version}`);
  }

  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'super-doc-vsix-assets-'));
  try {
    const { stdout } = await execFile(
      'npm',
      ['pack', `@desirecore/super-doc@${version}`, '--json', '--ignore-scripts', '--pack-destination', temporaryDirectory],
      { cwd: temporaryDirectory, maxBuffer: 1024 * 1024 },
    );
    const [packResult] = JSON.parse(stdout);

    if (
      packResult?.name !== '@desirecore/super-doc' ||
      packResult?.version !== version ||
      packResult?.id !== `@desirecore/super-doc@${version}` ||
      packResult?.integrity !== expectedIntegrity ||
      typeof packResult?.filename !== 'string'
    ) {
      throw new Error('npm pack metadata did not match the reviewed @desirecore/super-doc tarball');
    }

    const unpackedDirectory = join(temporaryDirectory, 'unpacked');
    await mkdir(unpackedDirectory);
    const tarballPath = join(temporaryDirectory, packResult.filename);
    await assertNonEmptyFile(tarballPath, 'Downloaded SuperDoc tarball');
    await execFile('tar', ['-xzf', tarballPath, '-C', unpackedDirectory]);

    const packageDirectory = join(unpackedDirectory, 'package');
    const packedPackage = await readJson(join(packageDirectory, 'package.json'));
    if (packedPackage.name !== '@desirecore/super-doc' || packedPackage.version !== version) {
      throw new Error('The unpacked SuperDoc package metadata did not match the requested release');
    }

    const packedDistDirectory = join(packageDirectory, 'dist');
    for (const asset of requiredAssets) {
      await assertNonEmptyFile(join(packedDistDirectory, asset), `Required SuperDoc asset (${asset})`);
    }

    // Rspack writes webview/index.js first. Copy only the runtime assets that
    // the extension consumes, leaving that Rspack output intact and excluding
    // package declaration files and unrelated SuperDoc bundle variants.
    await mkdir(outputDirectory, { recursive: true });
    await cp(join(packedDistDirectory, 'super-doc.js'), join(outputDirectory, 'super-doc.js'), { force: true });
    await cp(join(packedDistDirectory, 'super-doc.min.css'), join(outputDirectory, 'super-doc.min.css'), { force: true });
    await rm(join(outputDirectory, 'fonts'), { recursive: true, force: true });
    await cp(join(packedDistDirectory, 'fonts'), join(outputDirectory, 'fonts'), { recursive: true, force: true });
    await writeFile(
      join(outputDirectory, '.super-doc-release.json'),
      `${JSON.stringify(
        {
          name: packResult.name,
          version: packResult.version,
          tarball: packResult.filename,
          integrity: packResult.integrity,
        },
        null,
        2,
      )}\n`,
      'utf8',
    );

    console.log(`Prepared VSIX web resources from @desirecore/super-doc@${version}.`);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

await main();
