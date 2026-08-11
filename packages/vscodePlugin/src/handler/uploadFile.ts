import axios from 'axios';
import * as path from 'path';
import * as vscode from 'vscode';
import { getAssetDirectory, getBackfillImageProps, getCustomUploader, getImageUploadMode } from '../config';
import type { UploadFileRequest, UploadFileResult } from '../types/upload';

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const UPLOAD_TIMEOUT_MS = 30_000;
const IMAGE_MIME_TYPE = /^image\/(?:avif|bmp|gif|jpe?g|png|webp)$/i;
const IMAGE_EXTENSIONS = ['avif', 'bmp', 'gif', 'jpeg', 'jpg', 'png', 'webp'];
const MIME_BY_EXTENSION: Record<string, string> = {
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};
const UNSAFE_HEADER_NAMES = new Set([
  'authorization',
  'connection',
  'content-length',
  'cookie',
  'host',
  'proxy-authorization',
  'transfer-encoding',
]);

interface SelectedUploadFile {
  uri: vscode.Uri;
  name: string;
  type: string;
  size: number;
}

function parseHttpUrl(value: string, settingName: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${settingName} must be a valid URL.`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error(`${settingName} must use HTTP or HTTPS.`);
  if (!url.hostname || url.username || url.password) throw new Error(`${settingName} must not include credentials.`);
  return url;
}

function normalizeHeaders(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const headers: Record<string, string> = {};
  for (const [key, headerValue] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase();
    if (typeof headerValue !== 'string') throw new Error(`Upload header "${key}" must be a string.`);
    if (!key.trim() || /[\r\n]/.test(key) || /[\r\n]/.test(headerValue))
      throw new Error('Upload headers cannot contain newlines.');
    if (
      UNSAFE_HEADER_NAMES.has(normalizedKey) ||
      normalizedKey.startsWith('proxy-') ||
      normalizedKey.startsWith('sec-')
    ) {
      throw new Error(`Upload header "${key}" is managed by the extension.`);
    }
    headers[key] = headerValue;
  }
  return headers;
}

function isAllowedResultUrl(value: string): boolean {
  if (/[\u0000-\u001f()[\]<>\\]/.test(value)) return false;
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      return Boolean(url.hostname) && !url.username && !url.password;
    } catch {
      return false;
    }
  }
  return /^data:image\/(?:avif|bmp|gif|jpe?g|png|webp);base64,[A-Za-z\d+/]*={0,2}$/i.test(value);
}

export function parseUploadResponse(data: unknown): string {
  const candidates: unknown[] = [];
  if (typeof data === 'string') candidates.push(data);
  else if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;
    candidates.push(record.url);
    if (Array.isArray(record.result)) candidates.push(record.result[0]);
    if (typeof record.data === 'string') candidates.push(record.data);
    else if (record.data && typeof record.data === 'object')
      candidates.push((record.data as Record<string, unknown>).url);
  }
  const url = candidates.find(
    (candidate): candidate is string => typeof candidate === 'string' && isAllowedResultUrl(candidate),
  );
  if (!url) throw new Error('The upload response does not contain a supported URL.');
  return url;
}

function safeFileName(value: string): string {
  const normalized = path.posix
    .basename((value || 'image').trim().replace(/\\/g, '/'))
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_');
  return normalized.slice(0, 255) || 'image';
}

async function selectUploadFile(mode: 'workspace' | 'data' | 'remote'): Promise<SelectedUploadFile> {
  const selected = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    openLabel: vscode.l10n.t('Choose file to upload'),
    filters: mode === 'remote' ? undefined : { Images: IMAGE_EXTENSIONS },
  });
  const uri = selected?.[0];
  if (!uri) throw new Error('Upload cancelled.');
  const stat = await vscode.workspace.fs.stat(uri);
  if ((stat.type & vscode.FileType.File) === 0) throw new Error('The upload target is not a file.');
  if (stat.size > MAX_UPLOAD_BYTES) throw new Error('The upload file exceeds the 50 MB limit.');
  const name = safeFileName(path.posix.basename(uri.path));
  return { uri, name, type: MIME_BY_EXTENSION[path.posix.extname(name).toLowerCase()] ?? '', size: stat.size };
}

async function readUploadFile(fileInfo: SelectedUploadFile): Promise<Uint8Array> {
  const before = await vscode.workspace.fs.stat(fileInfo.uri);
  if ((before.type & vscode.FileType.File) === 0 || before.size > MAX_UPLOAD_BYTES || before.size !== fileInfo.size) {
    throw new Error('The upload file changed before it was read.');
  }
  const file = await vscode.workspace.fs.readFile(fileInfo.uri);
  if (file.length > MAX_UPLOAD_BYTES || file.length !== fileInfo.size)
    throw new Error('The upload file changed while it was being read.');
  return file;
}

function splitFileName(fileName: string): { stem: string; extension: string } {
  const parsed = path.posix.parse(fileName);
  return { stem: parsed.name || 'image', extension: parsed.ext };
}

async function fileExists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

function relativeAssetPath(document: vscode.Uri, asset: vscode.Uri): string {
  const relative = path.posix.relative(path.posix.dirname(document.path), asset.path).replace(/\\/g, '/');
  const encoded = relative.split('/').map(encodeURIComponent).join('/');
  return relative.startsWith('..') ? encoded : `./${encoded}`;
}

let workspaceUploadQueue: Promise<void> = Promise.resolve();

async function saveWorkspaceAsset(fileInfo: SelectedUploadFile, resource: vscode.Uri): Promise<string> {
  if (!vscode.workspace.isTrusted) throw new Error('Saving workspace assets is unavailable in Restricted Mode.');
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(resource);
  if (!workspaceFolder) throw new Error('Open a workspace to save uploaded files locally.');
  const directory = vscode.Uri.joinPath(workspaceFolder.uri, ...getAssetDirectory(resource).split('/'));
  await vscode.workspace.fs.createDirectory(directory);
  const source = await readUploadFile(fileInfo);
  const { stem, extension } = splitFileName(fileInfo.name);
  for (let index = 0; index < 10_000; index += 1) {
    const asset = vscode.Uri.joinPath(directory, index === 0 ? `${stem}${extension}` : `${stem}-${index}${extension}`);
    if (await fileExists(asset)) continue;
    const temporary = vscode.Uri.joinPath(
      directory,
      `.${stem}.cherry-upload-${Date.now()}-${index}-${Math.random().toString(36).slice(2)}.tmp`,
    );
    await vscode.workspace.fs.writeFile(temporary, source);
    try {
      await vscode.workspace.fs.rename(temporary, asset, { overwrite: false });
      return relativeAssetPath(resource, asset);
    } catch (error) {
      try {
        await vscode.workspace.fs.delete(temporary, { useTrash: false });
      } catch {
        // The provider may have removed the temporary file while reporting the collision.
      }
      if (await fileExists(asset)) continue;
      throw error;
    }
  }
  throw new Error('Unable to allocate a unique workspace asset name.');
}

function queueWorkspaceAssetSave(fileInfo: SelectedUploadFile, resource: vscode.Uri): Promise<string> {
  const task = workspaceUploadQueue.then(() => saveWorkspaceAsset(fileInfo, resource));
  workspaceUploadQueue = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}

export const uploadFileHandler = async (
  request: UploadFileRequest,
  resource?: vscode.Uri,
): Promise<UploadFileResult> => {
  if (!resource || resource.toString() !== request.documentUri)
    throw new Error('The upload document is no longer active.');
  const mode = getImageUploadMode(resource);
  const selected = await selectUploadFile(mode);
  const result: UploadFileResult = {
    requestId: request.requestId,
    documentUri: resource.toString(),
    name: selected.name,
    url: '',
  };
  for (const property of getBackfillImageProps(resource)) result[property] = true;

  switch (mode) {
    case 'workspace':
      result.url = await queueWorkspaceAssetSave(selected, resource);
      return result;
    case 'remote': {
      const uploader = getCustomUploader(resource);
      if (uploader?.enable !== true || !uploader.url) throw new Error('Custom uploader is not configured.');
      const headers = normalizeHeaders(uploader.headers);
      const uploadUrl = parseHttpUrl(uploader.url, 'Custom uploader URL').toString();
      if (uploader.protocol === 'picgo') {
        if (selected.uri.scheme !== 'file') throw new Error('PicGo uploads require a local file.');
        const response = await axios.post<unknown>(
          uploadUrl,
          { list: [selected.uri.fsPath] },
          {
            headers: { ...headers, 'Content-Type': 'application/json' },
            responseType: 'json',
            timeout: UPLOAD_TIMEOUT_MS,
            maxContentLength: MAX_RESPONSE_BYTES,
            maxRedirects: 0,
          },
        );
        if ((response.data as { success?: unknown })?.success !== true) throw new Error('PicGo upload failed.');
        result.url = parseUploadResponse(response.data);
        return result;
      }
      if (!headers['Content-Type'] && !headers['content-type']) headers['Content-Type'] = 'application/octet-stream';
      if (!headers['X-File-Name'] && !headers['x-file-name']) headers['X-File-Name'] = selected.name;
      const response = await axios.post<unknown>(uploadUrl, Buffer.from(await readUploadFile(selected)), {
        headers,
        responseType: 'json',
        timeout: UPLOAD_TIMEOUT_MS,
        maxBodyLength: MAX_UPLOAD_BYTES,
        maxContentLength: MAX_RESPONSE_BYTES,
        maxRedirects: 0,
      });
      result.url = parseUploadResponse(response.data);
      return result;
    }
    case 'data':
      if (!IMAGE_MIME_TYPE.test(selected.type))
        throw new Error('Only raster images are supported without an uploader.');
      result.url = `data:${selected.type.toLowerCase()};base64,${Buffer.from(await readUploadFile(selected)).toString('base64')}`;
      return result;
  }
};
