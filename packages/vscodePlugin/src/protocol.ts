import type { CherryTheme } from './config';
import type { UploadFileRequest, UploadFileResult } from './types/upload';

export interface EditorState {
  text: string;
  theme: CherryTheme;
  documentUri: string;
  documentVersion: number;
  resourceUri: string;
}

export type ExtensionToWebviewMessage =
  | { cmd: 'editor-init'; data: EditorState }
  | { cmd: 'editor-change'; data: EditorState }
  | { cmd: 'editor-ack'; data: { requestId: number; documentVersion: number; text: string } }
  | { cmd: 'editor-scroll'; data: number }
  | { cmd: 'disable-edit'; data: Record<string, never> }
  | { cmd: 'enable-edit'; data: Record<string, never> }
  | { cmd: 'upload-file-result'; data: UploadFileResult }
  | { cmd: 'operation-error'; data: { operation: string; message: string; requestId?: number } };

export type WebviewToExtensionMessage =
  | { type: 'ready' }
  | { type: 'preview-scroll'; data: number }
  | { type: 'change-theme'; data: CherryTheme }
  | { type: 'editor-change'; data: { documentUri: string; baseVersion: number; requestId: number; markdown: string } }
  | { type: 'show-message'; data: string }
  | { type: 'upload-file'; data: UploadFileRequest }
  | { type: 'open-url'; data: string }
  | { type: 'export-png'; data: string };

const themes: CherryTheme[] = ['default', 'dark', 'gray', 'abyss', 'green', 'red', 'violet', 'blue'];
const MAX_TEXT_LENGTH = 8 * 1024 * 1024;
const MAX_PATH_LENGTH = 32_768;
export const PNG_DATA_URL_PREFIX = 'data:image/png;base64,';
export const MAX_PNG_EXPORT_BYTES = 10 * 1024 * 1024;
export const MAX_PNG_MESSAGE_LENGTH = PNG_DATA_URL_PREFIX.length + 4 * Math.ceil(MAX_PNG_EXPORT_BYTES / 3);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFiniteNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/** Calculate decoded bytes for a base64 string that has already passed syntax validation. */
export function getBase64DecodedByteLength(value: string): number {
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  return (value.length / 4) * 3 - padding;
}

function isUploadFileRequest(value: unknown): value is UploadFileRequest {
  return (
    isRecord(value) &&
    isFiniteNonNegativeNumber(value.requestId) &&
    typeof value.documentUri === 'string' &&
    value.documentUri.length > 0 &&
    value.documentUri.length <= MAX_PATH_LENGTH
  );
}

/** Reject malformed or oversized messages before they reach extension APIs. */
export function parseWebviewMessage(value: unknown): WebviewToExtensionMessage | undefined {
  if (!isRecord(value) || typeof value.type !== 'string') return undefined;
  switch (value.type) {
    case 'ready':
      return value.data === undefined ? { type: 'ready' } : undefined;
    case 'preview-scroll':
      return typeof value.data === 'number' && Number.isFinite(value.data)
        ? { type: value.type, data: value.data }
        : undefined;
    case 'change-theme':
      return themes.includes(value.data as CherryTheme)
        ? { type: value.type, data: value.data as CherryTheme }
        : undefined;
    case 'editor-change':
      return isRecord(value.data) &&
        typeof value.data.documentUri === 'string' &&
        value.data.documentUri.length > 0 &&
        value.data.documentUri.length <= MAX_PATH_LENGTH &&
        isFiniteNonNegativeNumber(value.data.baseVersion) &&
        isFiniteNonNegativeNumber(value.data.requestId) &&
        typeof value.data.markdown === 'string' &&
        value.data.markdown.length <= MAX_TEXT_LENGTH
        ? {
            type: value.type,
            data: {
              documentUri: value.data.documentUri,
              baseVersion: value.data.baseVersion,
              requestId: value.data.requestId,
              markdown: value.data.markdown,
            },
          }
        : undefined;
    case 'show-message':
      return typeof value.data === 'string' && value.data.length <= 2000
        ? { type: value.type, data: value.data }
        : undefined;
    case 'upload-file':
      return isUploadFileRequest(value.data) ? { type: value.type, data: value.data } : undefined;
    case 'open-url':
      return typeof value.data === 'string' && value.data.length <= MAX_PATH_LENGTH
        ? { type: value.type, data: value.data }
        : undefined;
    case 'export-png':
      return value.data === 'export-fail' ||
        (typeof value.data === 'string' &&
          value.data.startsWith(PNG_DATA_URL_PREFIX) &&
          value.data.length <= MAX_PNG_MESSAGE_LENGTH &&
          (value.data.length - PNG_DATA_URL_PREFIX.length) % 4 === 0 &&
          getBase64DecodedByteLength(value.data.slice(PNG_DATA_URL_PREFIX.length)) <= MAX_PNG_EXPORT_BYTES)
        ? { type: value.type, data: value.data }
        : undefined;
    default:
      return undefined;
  }
}
