import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  trusted: true,
  values: new Map<string, unknown>(),
  inspected: new Map<string, Record<string, unknown>>(),
  updates: [] as Array<[string, unknown, unknown]>,
}));

vi.mock('vscode', () => ({
  workspace: {
    get isTrusted() {
      return mocked.trusted;
    },
    getConfiguration: () => ({
      get: (key: string, fallback?: unknown) => (mocked.values.has(key) ? mocked.values.get(key) : fallback),
      inspect: (key: string) => mocked.inspected.get(key),
      update: async (key: string, value: unknown, target: unknown) => mocked.updates.push([key, value, target]),
    }),
  },
  ConfigurationTarget: { Global: 'global' },
}));

import {
  getBackfillImageProps,
  getImageUploadMode,
  migrateImageUploadMode,
  normalizeImageUploadMode,
  normalizeTheme,
} from '../src/config';

describe('VS Code configuration migration', () => {
  beforeEach(() => {
    mocked.trusted = true;
    mocked.values.clear();
    mocked.inspected.clear();
    mocked.updates.length = 0;
  });

  it.each(['None', '无', 'Нет'])('preserves legacy %s as data mode', (legacy) => {
    mocked.values.set('UploadType', legacy);
    expect(normalizeImageUploadMode(legacy)).toBe('data');
    expect(getImageUploadMode()).toBe('data');
  });

  it.each([
    'CustomUploader',
    '自定义上传器',
    'Пользовательский загрузчик',
    'PicGoServer',
    'PicGo 服务器',
    'PicGo服务器',
  ])('preserves legacy %s as remote mode', (legacy) => {
    mocked.values.set('UploadType', legacy);
    expect(normalizeImageUploadMode(legacy)).toBe('remote');
    expect(getImageUploadMode()).toBe('remote');
  });

  it('preserves localized Theme and image backfill settings', () => {
    expect(normalizeTheme('Зелёная')).toBe('green');
    expect(normalizeTheme('Красная')).toBe('red');
    mocked.values.set('BackfillImageProps', ['Граница', 'Без границы', 'Тень', 'Скруглённые углы']);
    expect(getBackfillImageProps()).toEqual(['isBorder', 'isNotBorder', 'isShadow', 'isRadius']);
  });

  it('uses data mode and never migrates in Restricted Mode', async () => {
    mocked.trusted = false;
    mocked.values.set('ImageUploadMode', 'remote');
    mocked.inspected.set('UploadType', { globalValue: 'PicGoServer' });
    const globalState = { get: () => undefined, update: vi.fn() };
    expect(getImageUploadMode()).toBe('data');
    await migrateImageUploadMode(globalState);
    expect(mocked.updates).toEqual([]);
    expect(globalState.update).not.toHaveBeenCalled();
  });

  it('migrates only a legacy global value', async () => {
    mocked.inspected.set('ImageUploadMode', { workspaceValue: undefined, globalValue: undefined });
    mocked.inspected.set('UploadType', { workspaceValue: 'PicGoServer', globalValue: 'None' });
    const globalState = { get: () => undefined, update: vi.fn() };
    await migrateImageUploadMode(globalState);
    expect(mocked.updates).toEqual([['ImageUploadMode', 'data', 'global']]);
    expect(globalState.update).toHaveBeenCalledWith('cherryMarkdown.imageUploadModeMigrated', true);
  });

  it.each(['PicGoServer', 'PicGo 服务器'])(
    'migrates a global %s endpoint without accepting a workspace endpoint',
    async (legacy) => {
      mocked.inspected.set('ImageUploadMode', { globalValue: undefined });
      mocked.inspected.set('UploadType', { globalValue: legacy });
      mocked.inspected.set('PicGoServer', {
        globalValue: 'http://127.0.0.1:36677/upload',
        workspaceValue: 'https://bad.example',
      });
      mocked.inspected.set('CustomUploader', { globalValue: { enable: false, url: '', headers: { Token: 'x' } } });
      const globalState = { get: () => undefined, update: vi.fn() };
      await migrateImageUploadMode(globalState);
      expect(mocked.updates).toEqual([
        ['ImageUploadMode', 'remote', 'global'],
        [
          'CustomUploader',
          { enable: true, url: 'http://127.0.0.1:36677/upload', headers: { Token: 'x' }, protocol: 'picgo' },
          'global',
        ],
      ]);
    },
  );
});
