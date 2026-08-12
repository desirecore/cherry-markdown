import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const packageDirectory = resolve(testDirectory, '../..');
const entryPath = resolve(packageDirectory, 'src/index.engine.core.js');
const engineRollupConfigPath = resolve(packageDirectory, 'build/rollup.engine.config.js');
const rollupBaseConfigPath = resolve(packageDirectory, 'build/rollup.base.config.js');
const consumerPath = '/consumer.ts';
const entryVirtualPath = '/entry.js';
const entrySource = readFileSync(entryPath, 'utf8');
const engineRollupConfig = readFileSync(engineRollupConfigPath, 'utf8');
const rollupBaseConfig = readFileSync(rollupBaseConfigPath, 'utf8');
const consumerSource = readFileSync(resolve(testDirectory, 'engine-core-consumer.ts'), 'utf8');
const coreEntryFileBase = basename(entryPath, '.js');
const coreWrapperTypePath = `./types/${coreEntryFileBase}`;

assert.match(
  entrySource,
  /@typedef \{\(new \(options: Partial<import\('~types\/cherry'\)\.CherryOptions>\) => Engine\) & typeof CherryEngine\} CherryEngineConstructor/,
  'the engine-core entry must declare Engine as the constructed runtime type before its static API',
);
assert.ok(
  engineRollupConfig.includes("input: isCoreBuild ? 'src/index.engine.core.js' : 'src/index.engine.js',"),
  'the core ESM bundle must originate from index.engine.core.js',
);
assert.equal(coreWrapperTypePath, './types/index.engine.core');
assert.ok(
  rollupBaseConfig.includes("const entryFileBase = entryFileName.replace(/\\.js$/, '');"),
  'the declaration wrapper must derive its type alias from the entry filename',
);
assert.ok(
  rollupBaseConfig.includes('from "./types/${entryFileBase}";'),
  'the declaration wrapper must import the derived inner declaration alias',
);

// Keep the public entry body and its JSDoc intact, but replace unrelated runtime
// imports with tiny declarations. This is deliberately a single-entry type
// consumer test, not a package-wide typecheck of the legacy editor sources.
const entryWithTypeStubs = `
class Engine { makeHtml(markdown) { return markdown; } }
class CherryStatic { static usePlugin() {} }
class SyntaxHookBase {}
class MenuHookBase {}
const mergeWith = (...values) => values[0];
const defaultConfig = {};
const customizer = {};
const cloneDeep = (value) => value;
const urlProcessorProxy = (value) => value;
export const enqueueMermaidRender = (_mermaid, renderer) => Promise.resolve(renderer());
${entrySource.replace(/^import .+;\n/gm, '').replace(/^export \{ enqueueMermaidRender \} from .+;\n/gm, '')}
`;

const virtualFiles = new Map([
  [consumerPath, consumerSource],
  [entryVirtualPath, entryWithTypeStubs],
  ['/types/cherry.d.ts', 'export interface CherryOptions {}'],
]);
const compilerOptions = {
  allowJs: true,
  checkJs: false,
  declaration: true,
  emitDeclarationOnly: true,
  target: ts.ScriptTarget.ES2020,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.NodeJs,
  skipLibCheck: true,
  types: [],
  baseUrl: '/',
  paths: {
    '@desirecore/super-doc/dist/super-doc.engine.core.esm.js': ['entry.js'],
    '~types/*': ['types/*'],
  },
};
const declarations = new Map();
const host = ts.createCompilerHost(compilerOptions);
const normalize = (filePath) => filePath.replace(/\\/g, '/');
const readVirtualFile = (filePath) => virtualFiles.get(normalize(filePath));

host.fileExists = (filePath) => readVirtualFile(filePath) !== undefined || ts.sys.fileExists(filePath);
host.readFile = (filePath) => readVirtualFile(filePath) ?? ts.sys.readFile(filePath);
host.getSourceFile = (filePath, languageVersion) => {
  const source = host.readFile(filePath);
  return source === undefined ? undefined : ts.createSourceFile(filePath, source, languageVersion, true);
};
host.writeFile = (filePath, content) => declarations.set(normalize(filePath), content);

const program = ts.createProgram([consumerPath], compilerOptions, host);
const emitResult = program.emit();
const diagnostics = ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics);

assert.deepEqual(
  diagnostics.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')),
  [],
  'the deep ESM entry consumer must see Engine.makeHtml and CherryEngine static members',
);
assert.match(
  declarations.get('/entry.d.ts') || '',
  /declare const CherryEngineExport: CherryEngineConstructor;/,
  'declaration emit must preserve the explicit constructor export type',
);

console.log(`Verified engine-core ESM consumer declaration and ${coreWrapperTypePath} wrapper-alias contract.`);
