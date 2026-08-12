export const MAX_PNG_EXPORT_BYTES = 10 * 1024 * 1024;
export const MAX_PNG_DATA_URL_LENGTH = Math.ceil((MAX_PNG_EXPORT_BYTES * 4) / 3) + 'data:image/png;base64,'.length;

export function isPngExportLengthWithinLimit(length) {
  return Number.isSafeInteger(length) && length >= 'data:image/png;base64,'.length && length <= MAX_PNG_DATA_URL_LENGTH;
}

export function isPngExportWithinLimit(value) {
  return (
    typeof value === 'string' &&
    value.startsWith('data:image/png;base64,') &&
    isPngExportLengthWithinLimit(value.length)
  );
}
