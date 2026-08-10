import { describe, expect, it } from 'vitest';
import CommentReference from '../../../src/core/hooks/CommentReference';

describe('core/hooks/commentReference', () => {
  it('leaves a long sequence of unmatched brackets untouched', () => {
    const hook = new CommentReference({ externals: {}, config: {} }) as any;
    const markdown = '['.repeat(20_000);

    expect(hook.replaceReferences(markdown)).toBe(markdown);
  });

  it('does not interpret an escaped image reference as an image consumer', () => {
    const hook = new CommentReference({ externals: {}, config: {} }) as any;

    expect(hook.isImageReference('\\![image]', 2)).toBe(false);
    expect(hook.isImageReference('\\\\![image]', 3)).toBe(true);
  });

  it('handles deeply nested image references without using the call stack', () => {
    const hook = new CommentReference({ externals: {}, config: {} }) as any;
    hook.commentCache = {
      img: { url: 'https://example.com/moon.jpg', args: [] },
      outer: { url: '/outer', args: [] },
    };
    let image = '![x][img]';
    for (let index = 0; index < 20_000; index += 1) {
      image = `![${image}][img]`;
    }

    let parsed = '';
    expect(() => {
      parsed = hook.replaceReferences(`[${image}][outer]`);
    }).not.toThrow();
    expect(parsed).not.toContain('\u0000');
  });
});
