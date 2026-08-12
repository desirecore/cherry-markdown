import { describe, expect, it } from 'vitest';
import {
  MAX_PNG_DATA_URL_LENGTH,
  MAX_PNG_EXPORT_BYTES,
  getPngExportDecodedByteLength,
  isPngExportLengthWithinLimit,
  isPngExportWithinLimit,
} from '../web-resources/scripts/export-limits';

describe('Webview PNG export limits', () => {
  it('keeps PNG exports below the 10 MB host IPC limit', () => {
    expect(MAX_PNG_EXPORT_BYTES).toBe(10 * 1024 * 1024);
    expect(MAX_PNG_DATA_URL_LENGTH).toBe('data:image/png;base64,'.length + 4 * Math.ceil(MAX_PNG_EXPORT_BYTES / 3));
    expect(isPngExportLengthWithinLimit(MAX_PNG_DATA_URL_LENGTH)).toBe(true);
    expect(isPngExportLengthWithinLimit(MAX_PNG_DATA_URL_LENGTH + 1)).toBe(false);
    expect(isPngExportWithinLimit('data:image/png;base64,AAAA')).toBe(true);
    expect(isPngExportWithinLimit('data:image/jpeg;base64,AAAA')).toBe(false);
  });

  it('accepts exactly 10 MB and rejects a same-length, one-byte-larger base64 PNG', () => {
    const prefix = 'data:image/png;base64,';
    const encodedLength = MAX_PNG_DATA_URL_LENGTH - prefix.length;
    const exactLimit = `${prefix}${'A'.repeat(encodedLength - 2)}==`;
    const oneByteOver = `${prefix}${'A'.repeat(encodedLength - 1)}=`;

    expect(getPngExportDecodedByteLength(exactLimit)).toBe(MAX_PNG_EXPORT_BYTES);
    expect(isPngExportWithinLimit(exactLimit)).toBe(true);
    expect(getPngExportDecodedByteLength(oneByteOver)).toBe(MAX_PNG_EXPORT_BYTES + 1);
    expect(isPngExportWithinLimit(oneByteOver)).toBe(false);
  });
});
