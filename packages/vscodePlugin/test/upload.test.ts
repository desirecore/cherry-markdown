import { beforeEach, describe, expect, it, vi } from 'vitest';

const host = vi.hoisted(() => ({
  mode: 'data',
  customUploader: undefined as unknown,
  fileSize: 3,
  selectFile: vi.fn(async () => [{ scheme: 'file', path: '/selected/image.png', fsPath: '/selected/image.png' }]),
  readFile: vi.fn(async () => new Uint8Array([1, 2, 3])),
  uriFile: vi.fn((value: string) => ({ path: value })),
  post: vi.fn(),
}));

vi.mock('vscode', () => ({
  workspace: {
    isTrusted: true,
    getConfiguration: () => ({
      get: (key: string) =>
        key === 'ImageUploadMode' ? host.mode : key === 'CustomUploader' ? host.customUploader : undefined,
      inspect: (key: string) => (key === 'ImageUploadMode' ? { globalValue: host.mode } : undefined),
    }),
    fs: {
      stat: async () => ({ type: 1, size: host.fileSize }),
      readFile: host.readFile,
    },
  },
  window: { showOpenDialog: host.selectFile },
  l10n: { t: (value: string) => value },
  FileType: { File: 1 },
  Uri: { file: host.uriFile, joinPath: () => ({ path: '' }) },
}));

vi.mock('axios', () => ({ default: { post: host.post } }));

import { MAX_DATA_UPLOAD_BYTES, parseUploadResponse, uploadFileHandler } from '../src/handler/uploadFile';

describe('upload response validation', () => {
  beforeEach(() => {
    host.mode = 'data';
    host.customUploader = undefined;
    host.fileSize = 3;
    host.selectFile.mockClear();
    host.readFile.mockClear();
    host.uriFile.mockClear();
    host.post.mockReset();
  });
  it('accepts explicit supported response shapes only', () => {
    expect(parseUploadResponse({ data: { url: 'https://cdn.example/image.png' } })).toBe(
      'https://cdn.example/image.png',
    );
    expect(parseUploadResponse({ result: ['data:image/png;base64,AAAA'] })).toBe('data:image/png;base64,AAAA');
  });

  it('rejects guessed, executable, and malformed URLs', () => {
    expect(() => parseUploadResponse({ arbitrary: 'https://cdn.example/guess.png' })).toThrow(/supported URL/);
    expect(() => parseUploadResponse('javascript:alert(1)')).toThrow(/supported URL/);
    expect(() => parseUploadResponse('data:image/svg+xml;base64,PHN2Zz4=')).toThrow(/supported URL/);
  });

  it('uses a host-selected URI instead of a Webview-supplied file path', async () => {
    const resource = { toString: () => 'file:///workspace/note.md' };
    const result = await uploadFileHandler(
      { requestId: 7, documentUri: 'file:///workspace/note.md' },
      resource as never,
    );
    expect(host.selectFile).toHaveBeenCalledOnce();
    expect(host.uriFile).not.toHaveBeenCalled();
    expect(result).toMatchObject({ requestId: 7, documentUri: 'file:///workspace/note.md', name: 'image.png' });
    expect(result.url).toBe('data:image/png;base64,AQID');
  });

  it('rejects data URL uploads larger than 5 MB before reading the file', async () => {
    host.fileSize = MAX_DATA_UPLOAD_BYTES + 1;
    const resource = { toString: () => 'file:///workspace/note.md' };
    await expect(
      uploadFileHandler({ requestId: 10, documentUri: 'file:///workspace/note.md' }, resource as never),
    ).rejects.toThrow('Data URL uploads are limited to 5 MB.');
    expect(host.readFile).not.toHaveBeenCalled();
  });

  it('preserves the legacy PicGo JSON protocol after migration', async () => {
    host.mode = 'remote';
    host.customUploader = { enable: true, url: 'http://127.0.0.1:36677/upload', protocol: 'picgo' };
    host.post.mockResolvedValue({ data: { success: true, result: ['https://cdn.example/picgo.png'] } });
    const resource = { toString: () => 'file:///workspace/note.md' };
    const result = await uploadFileHandler(
      { requestId: 8, documentUri: 'file:///workspace/note.md' },
      resource as never,
    );
    expect(host.post).toHaveBeenCalledWith(
      'http://127.0.0.1:36677/upload',
      { list: ['/selected/image.png'] },
      expect.objectContaining({ headers: { 'Content-Type': 'application/json' }, maxRedirects: 0 }),
    );
    expect(result.url).toBe('https://cdn.example/picgo.png');
  });

  it('rejects a PicGo response that does not confirm success', async () => {
    host.mode = 'remote';
    host.customUploader = { enable: true, url: 'http://127.0.0.1:36677/upload', protocol: 'picgo' };
    host.post.mockResolvedValue({ data: { success: false, result: ['https://cdn.example/ignored.png'] } });
    const resource = { toString: () => 'file:///workspace/note.md' };
    await expect(
      uploadFileHandler({ requestId: 9, documentUri: 'file:///workspace/note.md' }, resource as never),
    ).rejects.toThrow('PicGo upload failed.');
  });
});
