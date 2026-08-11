import { describe, expect, it } from 'vitest';
import { parseWebviewMessage } from '../src/protocol';

describe('VS Code Webview protocol', () => {
  it('accepts a bounded, versioned edit request', () => {
    expect(
      parseWebviewMessage({
        type: 'editor-change',
        data: { documentUri: 'file:///workspace/note.md', baseVersion: 3, requestId: 9, markdown: '# note' },
      }),
    ).toEqual({
      type: 'editor-change',
      data: { documentUri: 'file:///workspace/note.md', baseVersion: 3, requestId: 9, markdown: '# note' },
    });
  });

  it('rejects unsafe shape, negative ids, and unbound uploads', () => {
    expect(parseWebviewMessage({ type: 'editor-change', data: { baseVersion: -1 } })).toBeUndefined();
    expect(
      parseWebviewMessage({
        type: 'upload-file',
        data: { requestId: 1, documentUri: '' },
      }),
    ).toBeUndefined();
  });

  it('only accepts bounded PNG export payloads', () => {
    expect(parseWebviewMessage({ type: 'export-png', data: 'data:image/png;base64,AAAA' })).toEqual({
      type: 'export-png',
      data: 'data:image/png;base64,AAAA',
    });
    expect(parseWebviewMessage({ type: 'export-png', data: 'data:text/html;base64,AAAA' })).toBeUndefined();
  });
});
