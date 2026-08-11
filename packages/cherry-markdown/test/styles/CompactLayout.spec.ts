import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss, { type Declaration } from 'postcss';
import { compile } from 'sass';
import { beforeAll, describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));
const sassDir = resolve(testDir, '../../src/sass');
const cherryScssPath = resolve(sassDir, 'cherry.scss');

let cssRoot: postcss.Root;

const declarationsFor = (selector: string) => {
  const declarations = new Map<string, string>();
  cssRoot.walkRules((rule) => {
    if (!rule.selectors.includes(selector)) return;
    rule.walkDecls((decl) => declarations.set(decl.prop, decl.value));
  });
  return declarations;
};

describe('compact four-mode layout', () => {
  beforeAll(() => {
    const result = compile(cherryScssPath, {
      loadPaths: [sassDir],
      style: 'expanded',
    });
    cssRoot = postcss.parse(result.css);
  });

  it('publishes the shared typography and mode-specific padding tokens', () => {
    const cherry = declarationsFor('.cherry');

    expect(cherry.get('--editor-content-font-size')).toBe('15px');
    expect(cherry.get('--editor-content-line-height')).toBe('24px');
    expect(cherry.get('--editor-content-block-gap')).toBe('var(--spacing-md)');
    expect(cherry.get('--editor-split-padding-block')).toBe('var(--spacing-md)');
    expect(cherry.get('--editor-split-padding-inline')).toBe('var(--spacing-lg)');
    expect(cherry.get('--editor-full-padding-block')).toBe('var(--spacing-lg)');
    expect(cherry.get('--editor-full-padding-inline')).toBe('clamp(var(--spacing-lg), 2vw, var(--spacing-xl))');
    expect(cherry.get('--wysiwyg-content-padding-block')).toBe('clamp(20px, 2vw, var(--spacing-xl))');
    expect(cherry.get('--wysiwyg-content-padding-inline')).toBe('clamp(var(--spacing-xl), 4vw, var(--spacing-3xl))');
  });

  it('uses compact split and full padding without changing editor colors', () => {
    const codeMirror = declarationsFor('.cherry-editor .CodeMirror');
    expect(codeMirror.get('font-size')).toBe('var(--editor-content-font-size)');
    expect(codeMirror.get('line-height')).toBe('var(--editor-content-line-height)');

    expect(declarationsFor('.cherry-editor .CodeMirror-lines').get('padding')).toBe(
      'var(--editor-split-padding-block) var(--editor-split-padding-inline)',
    );
    expect(declarationsFor('.cherry-editor.cherry-editor--full .CodeMirror-lines').get('padding')).toBe(
      'var(--editor-full-padding-block) var(--editor-full-padding-inline)',
    );
    expect(declarationsFor('.cherry-previewer').get('padding')).toBe(
      'var(--editor-split-padding-block) var(--editor-split-padding-inline)',
    );
    expect(declarationsFor('.cherry-previewer.cherry-previewer--full').get('padding')).toBe(
      'var(--editor-full-padding-block) var(--editor-full-padding-inline)',
    );

    // CodeMirror 原有语法色仍由语义色 token 提供，紧凑化没有替换其调色板。
    expect(codeMirror.get('color')).toBe('var(--base-font-color)');
    expect(declarationsFor('.cherry-editor .cm-s-default .cm-link').get('color')).toBe('var(--editor-link-color)');
  });

  it('applies the same body and heading scale to preview and WYSIWYG', () => {
    const preview = declarationsFor('.cherry-previewer');
    expect(preview.get('font-size')).toBe('var(--editor-content-font-size)');
    expect(preview.get('line-height')).toBe('var(--editor-content-line-height)');

    const wysiwyg = declarationsFor('.cherry-wysiwyg .milkdown .ProseMirror');
    expect(wysiwyg.get('padding')).toBe('var(--wysiwyg-content-padding-block) var(--wysiwyg-content-padding-inline)');
    expect(wysiwyg.get('font-size')).toBe('var(--editor-content-font-size)');
    expect(wysiwyg.get('line-height')).toBe('var(--editor-content-line-height)');
    const wysiwygParagraph = declarationsFor('.cherry-wysiwyg .milkdown .ProseMirror p');
    expect(wysiwygParagraph.get('font-size')).toBe('var(--editor-content-font-size)');
    expect(wysiwygParagraph.get('line-height')).toBe('var(--editor-content-line-height)');

    const headingScale = [
      ['h1', '32px', '40px'],
      ['h2', '26px', '34px'],
      ['h3', '22px', '30px'],
      ['h4', '19px', '27px'],
      ['h5', '17px', '25px'],
      ['h6', '15px', '24px'],
    ];
    for (const [heading, fontSize, lineHeight] of headingScale) {
      const previewHeading = declarationsFor(`.cherry-previewer ${heading}`);
      const wysiwygHeading = declarationsFor(`.cherry-wysiwyg .milkdown .ProseMirror ${heading}`);
      expect(previewHeading.get('font-size')).toBe(fontSize);
      expect(previewHeading.get('line-height')).toBe(lineHeight);
      expect(wysiwygHeading.get('font-size')).toBe(fontSize);
      expect(wysiwygHeading.get('line-height')).toBe(lineHeight);
    }
  });

  it('does not add a Cherry palette or font family to Milkdown density rules', () => {
    const forbidden: Declaration[] = [];
    cssRoot.walkRules((rule) => {
      if (!rule.selector.startsWith('.cherry-wysiwyg .milkdown .ProseMirror')) return;
      rule.walkDecls((decl) => {
        if (
          ['color', 'background', 'background-color', 'font-family'].includes(decl.prop) ||
          decl.prop.startsWith('--crepe-color-') ||
          decl.prop.startsWith('--crepe-font-')
        ) {
          forbidden.push(decl);
        }
      });
    });

    expect(forbidden.map((decl) => `${decl.prop}: ${decl.value}`)).toEqual([]);
    expect(readFileSync(cherryScssPath, 'utf8')).not.toContain('引用块样式 — 覆盖 Milkdown');
  });
});
