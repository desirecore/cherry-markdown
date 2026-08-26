import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const releaseScriptPath = resolve(process.cwd(), 'scripts/release.sh');
const packVerifierPath = resolve(process.cwd(), 'packages/cherry-markdown/build/verify-pack.js');
const rollupBaseConfigPath = resolve(process.cwd(), 'packages/cherry-markdown/build/rollup.base.config.js');

describe('protected-branch release contract', () => {
  it('never pulls, commits, pushes, or bumps versions from the release script', () => {
    const script = readFileSync(releaseScriptPath, 'utf8');

    expect(script).not.toMatch(/\bgit\s+(pull|commit|push)\b/);
    expect(script).not.toMatch(/\bsed\b[^\n]*version/);
    expect(script).toContain('git diff --quiet');
    expect(script).toContain('git diff --cached --quiet');
    expect(script).toContain('PACKAGE_VERSION');
    expect(script).toContain('VERSION');
    expect(() => execFileSync('bash', ['-n', releaseScriptPath])).not.toThrow();
  });

  it('builds and verifies the exact tarball before optionally publishing those bytes', () => {
    const script = readFileSync(releaseScriptPath, 'utf8');
    const buildIndex = script.indexOf('yarn workspace @desirecore/super-doc build');
    const packIndex = script.indexOf('npm pack');
    const verifyIndex = script.indexOf('verify-pack.js');
    const publishIndex = script.indexOf('npm publish "$TARBALL"');

    expect(buildIndex).toBeGreaterThan(-1);
    expect(packIndex).toBeGreaterThan(buildIndex);
    expect(verifyIndex).toBeGreaterThan(packIndex);
    expect(publishIndex).toBeGreaterThan(verifyIndex);
    expect(script).toContain('No OTP provided');

    const verifier = readFileSync(packVerifierPath, 'utf8');
    expect(verifier).toContain('sha512');
    expect(verifier).toContain('shasum');
    expect(verifier).toContain('dist/super-doc.js');
    expect(verifier).toContain('dist/super-doc.esm.js');
    expect(verifier).toContain('dist/super-doc.min.css');
    expect(verifier).toContain('dist/types/capabilities.d.ts');
    expect(verifier).toContain('types/cherry.d.ts');
    expect(verifier).toContain('SUPER_DOC_CAPABILITIES');
    expect(verifier).toContain('--editor-content-font-size:15px');
    expect(verifier).toContain('mkdtempSync');
    expect(verifier).toContain('import(pathToFileURL');
    expect(verifier).toContain('createRequire');
    expect(verifier).toContain('Cherry.capabilities');
    expect(verifier).toContain('ribbonHeaderActions');
    expect(verifier).toContain('Cherry.prototype.setRibbonHeaderActions');
    expect(verifier).toContain('mermaidAPIRefs');
    expect(verifier).toContain('Cherry.prototype.switchModel');
    expect(verifier).toContain('Cherry.prototype.refreshPreviewer');
    expect(verifier).toContain('instanceof Promise');
  });

  it('does not recursively transpile Babel runtime and core-js compatibility code', () => {
    const rollupConfig = readFileSync(rollupBaseConfigPath, 'utf8');

    expect(rollupConfig).toContain('BABEL_RUNTIME_DEPENDENCIES');
    expect(rollupConfig).toContain('@babel');
    expect(rollupConfig).toContain('core-js');
    expect(rollupConfig).toContain('regenerator-runtime');
    expect(rollupConfig).toMatch(/TRANSPILE_ALL_DEPENDENCIES[\s\S]*\? \[BABEL_RUNTIME_DEPENDENCIES\]/);
  });
});
