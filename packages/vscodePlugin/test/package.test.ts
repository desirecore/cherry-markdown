import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

const pluginRoot = path.resolve(__dirname, '..');

describe('VS Code package contract', () => {
  it('uses stable settings and restricts every upload-affecting setting', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'package.json'), 'utf8'));
    const properties = manifest.contributes.configuration.properties;
    expect(properties['cherryMarkdown.Theme']).toBeUndefined();
    expect(properties['cherryMarkdown.UploadType']).toBeUndefined();
    expect(properties['cherryMarkdown.ImageUploadMode'].enum).toEqual(['workspace', 'data', 'remote']);
    expect(manifest.capabilities.untrustedWorkspaces.restrictedConfigurations).toEqual(
      expect.arrayContaining([
        'cherryMarkdown.ImageUploadMode',
        'cherryMarkdown.CustomUploader',
        'cherryMarkdown.AssetDirectory',
      ]),
    );
  });

  it('does not ignore writable globals and excludes compiled Webview source from the VSIX', () => {
    expect(fs.readFileSync(path.join(pluginRoot, '.gitignore'), 'utf8')).not.toContain('global-vars.js');
    const vsixIgnore = fs.readFileSync(path.join(pluginRoot, '.vscodeignore'), 'utf8');
    expect(vsixIgnore).not.toContain('global-vars.js');
    expect(vsixIgnore).toContain('web-resources/scripts/index.js');
    expect(vsixIgnore).toContain('web-resources/scripts/editor-state.js');
    expect(vsixIgnore).toContain('web-resources/scripts/export-limits.js');
  });
});
