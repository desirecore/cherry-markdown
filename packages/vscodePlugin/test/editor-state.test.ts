import { describe, expect, it } from 'vitest';
import { shouldPreserveLocalEdit } from '../web-resources/scripts/editor-state';

const state = { documentUri: 'file:///workspace/note.md', documentVersion: 4 };

describe('Webview editor state refresh', () => {
  it('keeps an unacknowledged edit during same-version refreshes', () => {
    expect(
      shouldPreserveLocalEdit(
        state,
        { ...state, text: 'host value' },
        { requestId: 3, markdown: 'local value' },
        undefined,
      ),
    ).toBe(true);
    expect(shouldPreserveLocalEdit(state, { ...state, text: 'host value' }, undefined, 'local value')).toBe(true);
  });

  it('replaces state for a document or version change', () => {
    expect(shouldPreserveLocalEdit(state, { ...state, documentVersion: 5 }, { requestId: 3 }, undefined)).toBe(false);
    expect(
      shouldPreserveLocalEdit(state, { ...state, documentUri: 'file:///workspace/other.md' }, undefined, 'local'),
    ).toBe(false);
  });
});
