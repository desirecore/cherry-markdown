import { describe, expect, it } from 'vitest';
import {
  getBase64DecodedByteLength,
  MAX_PNG_EXPORT_BYTES,
  MAX_PNG_MESSAGE_LENGTH,
  parseWebviewMessage,
  PNG_DATA_URL_PREFIX,
} from '../src/protocol';

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
    expect(MAX_PNG_EXPORT_BYTES).toBe(10 * 1024 * 1024);
    expect(MAX_PNG_MESSAGE_LENGTH).toBe(PNG_DATA_URL_PREFIX.length + 4 * Math.ceil(MAX_PNG_EXPORT_BYTES / 3));
    expect(parseWebviewMessage({ type: 'export-png', data: 'data:image/png;base64,AAAA' })).toEqual({
      type: 'export-png',
      data: 'data:image/png;base64,AAAA',
    });
    expect(parseWebviewMessage({ type: 'export-png', data: 'data:text/html;base64,AAAA' })).toBeUndefined();
  });

  it('accepts exactly 10 MB and rejects a same-length, one-byte-larger PNG', () => {
    const encodedLength = MAX_PNG_MESSAGE_LENGTH - PNG_DATA_URL_PREFIX.length;
    const exactLimit = `${PNG_DATA_URL_PREFIX}${'A'.repeat(encodedLength - 2)}==`;
    const oneByteOver = `${PNG_DATA_URL_PREFIX}${'A'.repeat(encodedLength - 1)}=`;

    expect(getBase64DecodedByteLength(exactLimit.slice(PNG_DATA_URL_PREFIX.length))).toBe(MAX_PNG_EXPORT_BYTES);
    expect(parseWebviewMessage({ type: 'export-png', data: exactLimit })).toMatchObject({
      type: 'export-png',
      data: exactLimit,
    });
    expect(getBase64DecodedByteLength(oneByteOver.slice(PNG_DATA_URL_PREFIX.length))).toBe(MAX_PNG_EXPORT_BYTES + 1);
    expect(parseWebviewMessage({ type: 'export-png', data: oneByteOver })).toBeUndefined();
  });
});
