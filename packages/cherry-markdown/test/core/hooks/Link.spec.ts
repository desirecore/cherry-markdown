import { describe, expect, it } from 'vitest';
import Link from '../../../src/core/hooks/Link';

function createLinkHook(urlProcessor = (url: string) => url, config = {}) {
  const hook = new Link({ config, globalConfig: {} }) as any;
  hook.$engine = { urlProcessor };
  hook.$engine.$cherry = {
    options: {
      engine: {
        syntax: {
          link: {
            attrRender: () => '',
          },
        },
      },
    },
  };
  return hook;
}

describe('core/hooks/link', () => {
  it('renders an inline link whose text contains consecutive bracket groups', () => {
    const hook = createLinkHook();
    const input = '[[20240803][子标题]例子段落(2)](例子.md#[20240803][子标题]例子段落(2))';
    const html = hook.makeHtml(input);

    expect(html).not.toBe(input);
    expect(html).toContain('<a href="cherry-inner://');
    expect(html).toContain('>[20240803][子标题]例子段落(2)</a>');
  });

  it('keeps a prefix before an inline link', () => {
    const html = createLinkHook().makeHtml('[2][text](https://example.com)');

    expect(html).toContain('[2]<a href="cherry-inner://');
    expect(html).toContain('>text</a>');
  });

  it('leaves an unresolved reference-style link for CommentReference to handle', () => {
    const hook = createLinkHook();
    const input = '[text][undefinedref]';

    expect(hook.makeHtml(input)).toBe(input);
  });

  it.each([
    ['[text](https://example.com){target=_blank}', 'target="_blank"'],
    ['[text](https://example.com){target=_parent}', 'target="_parent"'],
    ['[text](https://example.com){target=_self}', 'target="_self"'],
    ['[text](https://example.com){target=_top}', 'target="_top"'],
    ['[text](https://example.com "the title")', 'title="the title"'],
    ['[text](https://example.com/f(o)o)', '<a href="cherry-inner://'],
  ])('preserves supported inline-link syntax: %s', (markdown, expected) => {
    const html = createLinkHook().makeHtml(markdown);

    expect(html).toContain(expected);
    expect(html).toContain('>text</a>');
  });

  it('does not emit a link when urlProcessor rewrites a safe URL to a dangerous scheme', () => {
    const html = createLinkHook(() => 'jav&#x61;script:alert(1)').makeHtml('[text](https://example.com)');

    expect(html).not.toContain('<a ');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('<span>text</span>');
  });
});
