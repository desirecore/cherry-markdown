export const MAX_PNG_EXPORT_BYTES = 10 * 1024 * 1024;
const PNG_DATA_URL_PREFIX = 'data:image/png;base64,';
export const MAX_PNG_DATA_URL_LENGTH = PNG_DATA_URL_PREFIX.length + 4 * Math.ceil(MAX_PNG_EXPORT_BYTES / 3);

export function isPngExportLengthWithinLimit(length) {
  return Number.isSafeInteger(length) && length >= 'data:image/png;base64,'.length && length <= MAX_PNG_DATA_URL_LENGTH;
}

export function getPngExportDecodedByteLength(value) {
  const base64Length = value.length - PNG_DATA_URL_PREFIX.length;
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  return (base64Length / 4) * 3 - padding;
}

export function isPngExportWithinLimit(value) {
  return (
    typeof value === 'string' &&
    value.startsWith(PNG_DATA_URL_PREFIX) &&
    isPngExportLengthWithinLimit(value.length) &&
    (value.length - PNG_DATA_URL_PREFIX.length) % 4 === 0 &&
    getPngExportDecodedByteLength(value) <= MAX_PNG_EXPORT_BYTES
  );
}
