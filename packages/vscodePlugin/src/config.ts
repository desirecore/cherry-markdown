import * as vscode from 'vscode';
import type { BackfillImageProp, CustomUploader, ImageUploadMode } from './types/upload';

export type UsageMode = 'active' | 'only-manual';
export type CherryTheme = 'default' | 'dark' | 'gray' | 'abyss' | 'green' | 'red' | 'violet' | 'blue';

export const THEME_STATE_KEY = 'cherryMarkdown.theme';
export const IMAGE_UPLOAD_MODE_MIGRATED_KEY = 'cherryMarkdown.imageUploadModeMigrated';
export const DEFAULT_ASSET_DIRECTORY = '.cherry-assets';

const usageAliases: Record<string, UsageMode> = {
  active: 'active',
  Active: 'active',
  激活: 'active',
  Активный: 'active',
  'only-manual': 'only-manual',
  'Manual only': 'only-manual',
  仅手动: 'only-manual',
  'Только вручную': 'only-manual',
};

const themeAliases: Record<string, CherryTheme> = {
  default: 'default',
  Default: 'default',
  默认: 'default',
  'По умолчанию': 'default',
  dark: 'dark',
  Dark: 'dark',
  深色: 'dark',
  Тёмная: 'dark',
  gray: 'gray',
  Gray: 'gray',
  沉稳: 'gray',
  abyss: 'abyss',
  Abyss: 'abyss',
  深海: 'abyss',
  green: 'green',
  Green: 'green',
  绿色: 'green',
  red: 'red',
  Red: 'red',
  红色: 'red',
  violet: 'violet',
  Violet: 'violet',
  淡雅: 'violet',
  blue: 'blue',
  Blue: 'blue',
  清幽: 'blue',
};

const imageUploadModeAliases: Record<string, ImageUploadMode> = {
  workspace: 'workspace',
  Workspace: 'workspace',
  工作区: 'workspace',
  data: 'data',
  Data: 'data',
  Base64: 'data',
  base64: 'data',
  None: 'data',
  无: 'data',
  Нет: 'data',
  remote: 'remote',
  Remote: 'remote',
  远程: 'remote',
  custom: 'remote',
  CustomUploader: 'remote',
  PicGoServer: 'remote',
};

const legacyPicGoValues = new Set(['PicGoServer', 'PicGo Server', 'PicGo 服务器', 'PicGo服务器']);

const backfillAliases: Record<string, BackfillImageProp> = {
  isBorder: 'isBorder',
  Border: 'isBorder',
  边框: 'isBorder',
  isNotBorder: 'isNotBorder',
  'No border': 'isNotBorder',
  无边框: 'isNotBorder',
  isShadow: 'isShadow',
  Shadow: 'isShadow',
  阴影: 'isShadow',
  isRadius: 'isRadius',
  'Rounded corners': 'isRadius',
  圆角: 'isRadius',
};

function configuration(resource?: vscode.Uri): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration('cherryMarkdown', resource);
}

export function normalizeUsage(value: unknown): UsageMode {
  return typeof value === 'string' ? (usageAliases[value] ?? 'active') : 'active';
}

export function normalizeTheme(value: unknown): CherryTheme {
  return typeof value === 'string' ? (themeAliases[value] ?? 'default') : 'default';
}

export function normalizeImageUploadMode(value: unknown): ImageUploadMode {
  return typeof value === 'string' ? (imageUploadModeAliases[value] ?? 'workspace') : 'workspace';
}

export function getUsageMode(resource?: vscode.Uri): UsageMode {
  return normalizeUsage(configuration(resource).get('Usage'));
}

export function getTheme(globalState: Pick<vscode.Memento, 'get'>, resource?: vscode.Uri): CherryTheme {
  const stored = globalState.get<unknown>(THEME_STATE_KEY);
  return stored === undefined ? normalizeTheme(configuration(resource).get('Theme')) : normalizeTheme(stored);
}

/** Preserve a user's legacy global preference without trusting a workspace setting. */
export async function migrateTheme(globalState: Pick<vscode.Memento, 'get' | 'update'>): Promise<void> {
  if (globalState.get<unknown>(THEME_STATE_KEY) !== undefined) return;
  const legacy = configuration().inspect<unknown>('Theme')?.globalValue;
  if (legacy !== undefined) await globalState.update(THEME_STATE_KEY, normalizeTheme(legacy));
}

function hasExplicitImageUploadMode(config: vscode.WorkspaceConfiguration): boolean {
  const inspected = config.inspect<unknown>('ImageUploadMode');
  if (!inspected) return config.get<unknown>('ImageUploadMode') !== undefined;
  return [
    inspected.globalValue,
    inspected.workspaceValue,
    inspected.workspaceFolderValue,
    inspected.globalLanguageValue,
    inspected.workspaceLanguageValue,
    inspected.workspaceFolderLanguageValue,
  ].some((value) => value !== undefined);
}

function legacyImageUploadMode(resource?: vscode.Uri): ImageUploadMode | undefined {
  const legacy = configuration(resource).get<unknown>('UploadType');
  return legacy === undefined ? undefined : normalizeImageUploadMode(legacy);
}

export function getImageUploadMode(resource?: vscode.Uri): ImageUploadMode {
  // In Restricted Mode never permit the Webview to persist files or contact an uploader configured by the workspace.
  if (!vscode.workspace.isTrusted) return 'data';
  const config = configuration(resource);
  return hasExplicitImageUploadMode(config)
    ? normalizeImageUploadMode(config.get('ImageUploadMode'))
    : (legacyImageUploadMode(resource) ?? 'workspace');
}

/** Only migrate an explicit legacy *global* value in a trusted workspace. */
export async function migrateImageUploadMode(globalState: Pick<vscode.Memento, 'get' | 'update'>): Promise<void> {
  if (!vscode.workspace.isTrusted || globalState.get<boolean>(IMAGE_UPLOAD_MODE_MIGRATED_KEY)) return;
  const config = configuration();
  const target = config.inspect<unknown>('ImageUploadMode');
  if (target?.globalValue === undefined) {
    const legacy = config.inspect<unknown>('UploadType')?.globalValue;
    if (legacy !== undefined) {
      await config.update('ImageUploadMode', normalizeImageUploadMode(legacy), vscode.ConfigurationTarget.Global);
      if (typeof legacy === 'string' && legacyPicGoValues.has(legacy)) {
        const picGoUrl = config.inspect<unknown>('PicGoServer')?.globalValue;
        const custom = config.inspect<CustomUploader>('CustomUploader')?.globalValue;
        if (typeof picGoUrl === 'string' && picGoUrl.trim() && !custom?.url) {
          await config.update(
            'CustomUploader',
            { enable: true, url: picGoUrl.trim(), headers: custom?.headers ?? {}, protocol: 'picgo' },
            vscode.ConfigurationTarget.Global,
          );
        }
      }
    }
  }
  await globalState.update(IMAGE_UPLOAD_MODE_MIGRATED_KEY, true);
}

export function getCustomUploader(resource?: vscode.Uri): CustomUploader | undefined {
  return configuration(resource).get<CustomUploader>('CustomUploader');
}

export function getAssetDirectory(resource?: vscode.Uri): string {
  const configured = configuration(resource).get<unknown>('AssetDirectory', DEFAULT_ASSET_DIRECTORY);
  if (typeof configured !== 'string') return DEFAULT_ASSET_DIRECTORY;
  const segments = configured
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment && segment !== '.' && segment !== '..');
  return segments.join('/') || DEFAULT_ASSET_DIRECTORY;
}

export function getBackfillImageProps(resource?: vscode.Uri): BackfillImageProp[] {
  const value = configuration(resource).get<unknown>('BackfillImageProps');
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .map((item) => (typeof item === 'string' ? backfillAliases[item] : undefined))
        .filter((item): item is BackfillImageProp => item !== undefined),
    ),
  ];
}
