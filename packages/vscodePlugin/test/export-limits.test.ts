import { describe, expect, it } from 'vitest';
import {
  MAX_PNG_DATA_URL_LENGTH,
  MAX_PNG_EXPORT_BYTES,
  isPngExportLengthWithinLimit,
  isPngExportWithinLimit,
} from '../web-resources/scripts/export-limits';

describe('Webview PNG export limits', () => {
  it('keeps PNG exports below the 10 MB host IPC limit', () => {
    expect(MAX_PNG_EXPORT_BYTES).toBe(10 * 1024 * 1024);
    expect(MAX_PNG_DATA_URL_LENGTH).toBe(Math.ceil((MAX_PNG_EXPORT_BYTES * 4) / 3) + 'data:image/png;base64,'.length);
    expect(isPngExportLengthWithinLimit(MAX_PNG_DATA_URL_LENGTH)).toBe(true);
    expect(isPngExportLengthWithinLimit(MAX_PNG_DATA_URL_LENGTH + 1)).toBe(false);
    expect(isPngExportWithinLimit('data:image/png;base64,AAAA')).toBe(true);
    expect(isPngExportWithinLimit('data:image/jpeg;base64,AAAA')).toBe(false);
  });
});
