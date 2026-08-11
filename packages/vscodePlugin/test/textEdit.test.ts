import { describe, expect, it } from 'vitest';
import { calculateTextReplacement } from '../src/textEdit';

describe('calculateTextReplacement', () => {
  it('returns only the changed middle range', () => {
    expect(calculateTextReplacement('prefix old suffix', 'prefix new suffix')).toEqual({
      startOffset: 7,
      endOffset: 10,
      text: 'new',
    });
  });

  it('handles insertions, deletions, and no change', () => {
    expect(calculateTextReplacement('abc', 'aXYbc')).toEqual({ startOffset: 1, endOffset: 1, text: 'XY' });
    expect(calculateTextReplacement('abc', 'ac')).toEqual({ startOffset: 1, endOffset: 2, text: '' });
    expect(calculateTextReplacement('same', 'same')).toBeUndefined();
  });
});
