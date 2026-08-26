import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

const [packJsonPath, expectedVersion, packageDirArg] = process.argv.slice(2);

function fail(message) {
  throw new Error(`Release tarball verification failed: ${message}`);
}

if (!packJsonPath || !expectedVersion || !packageDirArg) {
  fail('usage: node build/verify-pack.js <npm-pack.json> <expected-version> <package-dir>');
}

const packageDir = resolve(packageDirArg);
const packageJson = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'));
const packResults = JSON.parse(readFileSync(resolve(packJsonPath), 'utf8'));
if (!Array.isArray(packResults) || packResults.length !== 1) fail('npm pack must return exactly one result');

const metadata = packResults[0];
const tarballPath = resolve(dirname(resolve(packJsonPath)), metadata.filename || '');
if (!metadata.filename || !existsSync(tarballPath)) fail('packed tarball is missing');
if (metadata.name !== '@desirecore/super-doc' || packageJson.name !== metadata.name) fail('package name mismatch');
if (metadata.version !== expectedVersion || packageJson.version !== expectedVersion) fail('package version mismatch');

const tarball = readFileSync(tarballPath);
const shasum = createHash('sha1').update(tarball).digest('hex');
const integrity = `sha512-${createHash('sha512').update(tarball).digest('base64')}`;
if (metadata.shasum !== shasum) fail('sha1 shasum does not match the packed bytes');
if (metadata.integrity !== integrity) fail('sha512 integrity does not match the packed bytes');
if (metadata.size !== statSync(tarballPath).size) fail('reported package size does not match the packed bytes');

const expectedEntrypoints = {
  main: './dist/super-doc.js',
  module: './dist/super-doc.esm.js',
  style: './dist/super-doc.min.css',
  types: './dist/types/index.d.ts',
};
Object.entries(expectedEntrypoints).forEach(([field, value]) => {
  if (packageJson[field] !== value) fail(`unexpected ${field} entrypoint: ${packageJson[field]}`);
});

const requiredFiles = [
  'package.json',
  ...Object.values(expectedEntrypoints).map((entry) => entry.replace(/^\.\//, '')),
  'dist/super-doc.core.js',
  'dist/types/capabilities.d.ts',
  'types/cherry.d.ts',
];
const metadataFiles = new Set((metadata.files || []).map((file) => file.path));
const tarEntries = new Set(
  execFileSync('tar', ['-tzf', tarballPath], { encoding: 'utf8' }).split('\n').filter(Boolean),
);
requiredFiles.forEach((relativePath) => {
  if (!metadataFiles.has(relativePath)) fail(`npm pack metadata is missing ${relativePath}`);
  if (!tarEntries.has(`package/${relativePath}`)) fail(`tarball is missing package/${relativePath}`);
});

const readPackedText = (relativePath) =>
  execFileSync('tar', ['-xOf', tarballPath, `package/${relativePath}`], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
const packedPackageJson = JSON.parse(readPackedText('package.json'));
if (packedPackageJson.version !== expectedVersion) fail('packed package.json version mismatch');
Object.entries(expectedEntrypoints).forEach(([field, value]) => {
  if (packedPackageJson[field] !== value) fail(`packed package.json has an unexpected ${field} entrypoint`);
});

const coreBundle = readPackedText('dist/super-doc.core.js');
[
  'SUPER_DOC_CAPABILITIES',
  'modeCommitted',
  'awaitableRefreshPreviewer',
  'compactLayout',
  'ribbonHeaderActions',
  'setRibbonHeaderActions',
].forEach((marker) => {
  if (!coreBundle.includes(marker)) fail(`core bundle is missing ${marker}`);
});

const compactCss = readPackedText('dist/super-doc.min.css').replace(/\s/g, '');
[
  '--editor-content-font-size:15px',
  '--editor-content-line-height:24px',
  '--editor-split-padding-inline:var(--spacing-lg)',
  '--wysiwyg-content-padding-inline:clamp(var(--spacing-xl),4vw,var(--spacing-3xl))',
  '.cherry-ribbon-header-actions{',
].forEach((marker) => {
  if (!compactCss.includes(marker)) fail(`packed CSS is missing ${marker}`);
});

const capabilityTypes = readPackedText('dist/types/capabilities.d.ts');
if (!capabilityTypes.includes('SUPER_DOC_CAPABILITIES') || !capabilityTypes.includes('SuperDocCapabilities')) {
  fail('packed capability types are incomplete');
}
const publicTypes = readPackedText('types/cherry.d.ts');
[
  'ModeCommittedPayload',
  'modeCommitted',
  'SuperDocCapabilities',
  'CherryRibbonHeaderActions',
  'setRibbonHeaderActions',
].forEach((marker) => {
  if (!publicTypes.includes(marker)) fail(`packed public types are missing ${marker}`);
});

const runtimeDirectory = mkdtempSync(join(tmpdir(), 'super-doc-pack-runtime-'));
let runtimeContract;
try {
  execFileSync('tar', ['-xzf', tarballPath, '-C', runtimeDirectory]);
  const runtimePackageDirectory = join(runtimeDirectory, 'package');
  const esmPath = join(runtimePackageDirectory, expectedEntrypoints.module.replace(/^\.\//, ''));
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://super-doc.local/' });
  const browserGlobals = {
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    location: dom.window.location,
    localStorage: dom.window.localStorage,
    Element: dom.window.Element,
    HTMLElement: dom.window.HTMLElement,
    HTMLDivElement: dom.window.HTMLDivElement,
    HTMLSpanElement: dom.window.HTMLSpanElement,
    Node: dom.window.Node,
    DOMParser: dom.window.DOMParser,
    MutationObserver: dom.window.MutationObserver,
    CustomEvent: dom.window.CustomEvent,
    Event: dom.window.Event,
    MouseEvent: dom.window.MouseEvent,
    SVGElement: dom.window.SVGElement,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    requestAnimationFrame: (callback) => setTimeout(callback, 0),
    cancelAnimationFrame: (timer) => clearTimeout(timer),
  };
  Object.entries(browserGlobals).forEach(([name, value]) => {
    Object.defineProperty(globalThis, name, { configurable: true, value, writable: true });
  });

  const publishedModule = await import(pathToFileURL(esmPath).href);
  const expectedCapabilities = {
    modeCommitted: true,
    asyncModeSwitch: true,
    awaitableRefreshPreviewer: true,
    compactLayout: true,
    ribbonHeaderActions: true,
  };
  if (JSON.stringify(publishedModule.SUPER_DOC_CAPABILITIES) !== JSON.stringify(expectedCapabilities)) {
    fail('published ESM named SUPER_DOC_CAPABILITIES export is invalid');
  }
  const Cherry = publishedModule.default;
  if (typeof Cherry !== 'function') fail('published ESM default Cherry export is invalid');
  if (Cherry.capabilities !== publishedModule.SUPER_DOC_CAPABILITIES) {
    fail('published default Cherry.capabilities does not reference the named capability export');
  }
  if (typeof Cherry.prototype.switchModel !== 'function') fail('published Cherry.switchModel is not public');
  if (typeof Cherry.prototype.refreshPreviewer !== 'function') fail('published Cherry.refreshPreviewer is not public');
  if (typeof Cherry.prototype.setRibbonHeaderActions !== 'function') {
    fail('published Cherry.setRibbonHeaderActions is not public');
  }
  const mermaidRenderer = Cherry.config?.defaults?.engine?.syntax?.codeBlock?.customRenderer?.mermaid;
  if (
    typeof mermaidRenderer?.mermaidAPIRefs?.initialize !== 'function' ||
    typeof mermaidRenderer?.mermaidAPIRefs?.render !== 'function'
  ) {
    fail('published ESM did not initialize the bundled Mermaid renderer contract');
  }

  // package.json is ESM-typed, so copy the exact packed UMD bytes to a .cjs
  // filename solely to execute its CommonJS branch in this isolated directory.
  const commonJsPath = join(runtimeDirectory, 'super-doc.cjs');
  copyFileSync(join(runtimePackageDirectory, expectedEntrypoints.main.replace(/^\.\//, '')), commonJsPath);
  const publishedCommonJs = createRequire(import.meta.url)(commonJsPath);
  const CommonJsCherry = publishedCommonJs.default;
  if (typeof CommonJsCherry !== 'function') fail('published UMD CommonJS default Cherry export is invalid');
  if (publishedCommonJs.SUPER_DOC_CAPABILITIES !== CommonJsCherry.capabilities) {
    fail('published UMD CommonJS Cherry.capabilities does not reference its named capability export');
  }
  if (JSON.stringify(CommonJsCherry.capabilities) !== JSON.stringify(expectedCapabilities)) {
    fail('published UMD CommonJS capabilities are invalid');
  }
  if (typeof CommonJsCherry.prototype.switchModel !== 'function') {
    fail('published UMD CommonJS Cherry.switchModel is not public');
  }
  if (typeof CommonJsCherry.prototype.refreshPreviewer !== 'function') {
    fail('published UMD CommonJS Cherry.refreshPreviewer is not public');
  }
  if (typeof CommonJsCherry.prototype.setRibbonHeaderActions !== 'function') {
    fail('published UMD CommonJS Cherry.setRibbonHeaderActions is not public');
  }

  const modeHarness = Object.assign(Object.create(Cherry.prototype), {
    committedModel: 'edit&preview',
    wysiwygInitPromise: null,
    status: { editor: 'show', previewer: 'show', wysiwyg: 'hide' },
    options: { callback: {} },
  });
  const switchPromise = modeHarness.switchModel('edit&preview');
  if (!(switchPromise instanceof Promise) || (await switchPromise) !== true) {
    fail('published Cherry.switchModel does not satisfy its Promise<boolean> contract');
  }

  const asyncRenderHandlers = new Set();
  const refreshHarness = Object.assign(Object.create(Cherry.prototype), {
    getValue: () => '# runtime contract',
    $event: {
      on: (eventName, handler) => eventName === 'afterAsyncRender' && asyncRenderHandlers.add(handler),
      off: (_eventName, handler) => asyncRenderHandlers.delete(handler),
    },
    engine: {
      makeHtml: (markdownText) => {
        queueMicrotask(() => {
          asyncRenderHandlers.forEach((handler) => handler({ markdownText, html: '<h1>runtime contract</h1>' }));
        });
        return '<h1>runtime contract</h1>';
      },
    },
    previewer: {
      refresh: () => {},
      cleanHtmlCache: () => {},
      afterUpdate: () => {},
    },
  });
  const refreshPromise = refreshHarness.refreshPreviewer();
  if (!(refreshPromise instanceof Promise) || (await refreshPromise) !== true) {
    fail('published Cherry.refreshPreviewer does not satisfy its Promise<boolean> contract');
  }

  runtimeContract = {
    esm: expectedEntrypoints.module,
    commonJs: expectedEntrypoints.main,
    namedCapabilities: true,
    defaultCherryCapabilities: true,
    bundledMermaid: true,
    switchModelPromise: true,
    refreshPreviewerPromise: true,
  };
  dom.window.close();
} finally {
  rmSync(runtimeDirectory, { force: true, recursive: true });
}

console.log(
  JSON.stringify(
    {
      name: metadata.name,
      version: metadata.version,
      filename: metadata.filename,
      size: metadata.size,
      shasum,
      integrity,
      entrypoints: expectedEntrypoints,
      runtimeContract,
      verifiedFiles: requiredFiles,
    },
    null,
    2,
  ),
);
