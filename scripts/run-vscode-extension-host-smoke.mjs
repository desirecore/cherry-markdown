import { stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '..');
const toolingPackage = join(repositoryRoot, 'packages', 'vscodePlugin', 'tools', 'package.json');
const require = createRequire(toolingPackage);
const { runTests, runVSCodeCommand } = require('@vscode/test-electron');
const vscodeVersion = '1.73.0';

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index === -1 || !process.argv[index + 1]) {
    return undefined;
  }
  return process.argv[index + 1];
}

async function requireFile(path, description) {
  const file = await stat(path);
  if (!file.isFile()) {
    throw new Error(`${description} is not a file: ${path}`);
  }
}

async function main() {
  const archiveArgument = argument('--archive');
  const extensionArgument = argument('--extension');
  if (!archiveArgument || !extensionArgument) {
    throw new Error('Usage: node scripts/run-vscode-extension-host-smoke.mjs --archive <file.vsix> --extension <unpacked extension directory>');
  }

  const archive = resolve(archiveArgument);
  const extensionDirectory = resolve(extensionArgument);
  await requireFile(archive, 'VSIX archive');
  await requireFile(join(extensionDirectory, 'package.json'), 'Unpacked extension manifest');
  await requireFile(join(extensionDirectory, 'dist', 'extension.js'), 'Unpacked extension entrypoint');

  const cachePath = process.env.VSCODE_TEST_CACHE ?? join(repositoryRoot, '.vscode-test');
  const downloadOptions = { version: vscodeVersion, cachePath };

  // This accepts the exact archive produced earlier, using an isolated VS Code
  // profile. The subsequent Extension Host test runs the same unpacked archive
  // payload, not the source workspace.
  await runVSCodeCommand(['--install-extension', archive, '--force'], downloadOptions);
  await runTests({
    ...downloadOptions,
    extensionDevelopmentPath: extensionDirectory,
    extensionTestsPath: join(repositoryRoot, 'packages', 'vscodePlugin', 'test', 'extension-host-smoke.cjs'),
    extensionTestsEnv: { VSIX_EXTENSION_PATH: extensionDirectory },
    launchArgs: ['--disable-workspace-trust'],
  });

  console.log(`VSIX install and Extension Host activation smoke passed with VS Code ${vscodeVersion}.`);
}

await main();
