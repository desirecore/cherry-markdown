import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  env: { language: 'en' },
  Uri: { joinPath: (base: { path: string }, ...segments: string[]) => ({ path: [base.path, ...segments].join('/') }) },
}));

import { getWebviewContent } from '../src/webview';

describe('Webview shell', () => {
  it('does not embed Markdown or generate a writable global variables script', () => {
    const html = getWebviewContent(
      { webview: { cspSource: 'vscode-webview://safe', asWebviewUri: (uri: { path: string }) => `safe:${uri.path}` } },
      { path: '/extension' } as never,
    );
    expect(html).not.toContain('markdown-info');
    expect(html).not.toContain('global-vars');
    expect(html).toContain("base-uri 'none'");
    expect(html).toContain("form-action 'none'");
    expect(html).toContain("frame-src 'none'");
    expect(html).toContain("style-src vscode-webview://safe 'unsafe-inline'");
    expect(html).toContain('safe:/extension/web-resources/dist/super-doc.js');
  });
});
