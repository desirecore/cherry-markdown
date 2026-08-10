import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CherryEngine from '../../src/index.engine.core';
import EChartsCodeBlockEngine from '../../src/addons/advance/cherry-codeblock-echarts-plugin';
import EChartsTableEngine from '../../src/addons/advance/cherry-table-echarts-plugin';
import Header from '../../src/core/hooks/Header';
import List from '../../src/core/hooks/List';
import Table from '../../src/core/hooks/Table';
import { exportHTMLFile } from '../../src/utils/export';
import imgAltHelper from '../../src/utils/image';
import { escapeHTMLEntitiesWithoutSemicolon, isValidScheme } from '../../src/utils/sanitize';

const createEngine = () =>
  new CherryEngine({
    engine: {
      syntax: {
        header: {
          anchorStyle: 'none',
        },
      },
    },
  }) as any;

describe('ported upstream regressions', () => {
  beforeEach(() => {
    vi.stubGlobal('BUILD_ENV', 'production');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('security hardening', () => {
    it.each([
      'javascript:alert(1)',
      'jav\u0000ascript:alert(1)',
      'vbscript:msgbox(1)',
      'data:text/html;base64,PHNjcmlwdD4=',
      '&#x6a;avascript:alert(1)',
    ])('rejects dangerous URL scheme %s', (url) => {
      expect(isValidScheme(url)).toBe(false);
    });

    it.each(['javascript:alert(1)', 'vbscript:msgbox(1)', 'data:text/html;base64,PHNjcmlwdD4='])(
      'does not render a dangerous reference-style link using %s',
      (url) => {
        const html = createEngine().makeHtml(`[click][ref]\n\n[ref]: ${url}`);

        expect(html).not.toContain('<a ');
        expect(html).not.toContain(url);
        expect(html).toContain('[click][ref]');
      },
    );

    it('still renders safe reference-style links', () => {
      const html = createEngine().makeHtml('[guide][docs]\n\n[docs]: https://example.com/guide');

      expect(html).toContain('<a href="https://example.com/guide"');
    });

    it('escapes an ECharts rendering error before inserting it into the DOM', () => {
      vi.useFakeTimers();
      const root = document.createElement('div');
      root.innerHTML =
        '<div data-sign="chart" data-type="echarts"><div class="cherry-echarts-codeblock-wrapper"></div></div>';
      const chart = {
        setOption: vi.fn(() => {
          throw new Error('<img src=x onerror=alert(1)>');
        }),
      };
      const echarts = {
        getInstanceByDom: vi.fn(() => chart),
        init: vi.fn(() => chart),
      };
      const renderer = new EChartsCodeBlockEngine({ echarts });
      const engine = {
        $cherry: {
          previewer: { getDom: () => root },
          options: { engine: { global: { flowSessionContext: false } } },
        },
      };

      renderer.render('{ value: 1 }', 'chart', engine, 'echarts');
      vi.runAllTimers();

      const container = root.querySelector('.cherry-echarts-codeblock-wrapper') as HTMLElement;
      expect(container.querySelector('img')).toBeNull();
      expect(container.textContent).toContain('Render Error: <img src=x onerror=alert(1)>');
      expect(container.innerHTML).toContain('&lt;img src=x onerror=alert(1)&gt;');
    });

    it('round-trips chart data containing HTML-sensitive characters through data attributes', () => {
      vi.useFakeTimers();
      const renderer = new EChartsTableEngine({
        echarts: {
          getInstanceByDom: vi.fn(),
          init: vi.fn(),
        },
      }) as any;
      vi.spyOn(renderer, '$buildEchartsThemeFromCss').mockImplementation(() => {});
      vi.spyOn(renderer, '$generateChartOptions').mockReturnValue({});
      vi.spyOn(renderer, 'cleanupInvalidInstances').mockImplementation(() => {});
      const root = document.createElement('div');
      const tableObject = {
        header: ['<name & "label">'],
        rows: [['A&B', '<script>alert(1)</script>']],
        colLength: 2,
        rowLength: 1,
      };
      const options = { title: '"quoted" & <tag>' };
      const cherry = {
        previewer: { getDom: () => root },
        options: { engine: { syntax: { global: { flowSessionContext: true } } } },
      };

      const html = renderer.render('bar', options, tableObject, cherry);
      const host = document.createElement('div');
      host.innerHTML = html;
      const container = host.querySelector('.cherry-echarts-wrapper') as HTMLElement;

      expect(JSON.parse(container.getAttribute('data-table-data') || '')).toEqual(tableObject);
      expect(JSON.parse(container.getAttribute('data-chart-options') || '')).toEqual({
        title: '"quoted" & <tag>',
      });
      expect(container.querySelector('script')).toBeNull();
      vi.runAllTimers();
    });
  });

  describe('rendering correctness', () => {
    it('validates parsed hexadecimal code points', () => {
      expect(escapeHTMLEntitiesWithoutSemicolon('&#x41;')).toBe('&#x41;');
      expect(escapeHTMLEntitiesWithoutSemicolon('&#x110000;')).toBe('&amp;#x110000;');
    });

    it('preserves user text that only resembles an internal big-data placeholder', () => {
      const engine = createEngine();
      const markdown = 'literal bigDataBegin123abcbigDataEnd and data:cherry/cache;sha256,123abc should remain';

      expect(engine.$deCacheBigData(markdown)).toBe(markdown);
    });

    it('escapes every backslash-escaped ampersand', () => {
      expect(createEngine().dealAfterMakeHtml('\\& first and \\& second')).toBe('&amp; first and &amp; second');
    });

    it('renders an image source when no beforeImageMounted callback is configured', () => {
      const html = createEngine().makeHtml('![logo](https://example.com/logo.png)');

      expect(html).toContain('src="https://example.com/logo.png"');
      expect(html).not.toContain('src="undefined"');
    });

    it('numbers duplicate heading IDs without skipping the -2 suffix', () => {
      const header = new Header({ config: {}, externals: {}, cherry: undefined });

      expect(['same', 'same-2', 'same-3']).toEqual([
        header.generateIDNoDup('same'),
        header.generateIDNoDup('same'),
        header.generateIDNoDup('same'),
      ]);
    });

    it('includes absorbed leading blank lines in list line counts', () => {
      const list = new List({ config: { indentSpace: 2 } }) as any;

      expect(list.$getLineNum('\n\n- item\n')).toBe(2);
    });

    it('uses the valid float-left alignment class', () => {
      expect(imgAltHelper.processExtendStyleInAlt('image #float-left').extendClasses).toContain(
        'cherry-img-align-float-right',
      );
    });

    it('does not treat fenced code inside an HTML comment as an unclosed code block', () => {
      const markdown = ['<!-- ```plantuml', '@startuml', '@enduml', '``` -->', '', '### after'].join('\n');
      const html = createEngine().makeHtml(markdown);

      expect(html).toMatch(/<h3[^>]*>after<\/h3>/);
      expect(html).not.toContain('data-type="codeBlock"');
    });

    it('sanitizes a large multiline HTML table as one intact structure', () => {
      const rows = Array.from({ length: 150 }, (_, index) => `<tr><td>row-${index}</td></tr>`).join('\n');
      const html = createEngine().makeHtml(`<table>\n<tbody>\n${rows}\n</tbody>\n</table>`);
      const host = document.createElement('div');
      host.innerHTML = html;

      expect(host.querySelectorAll('table')).toHaveLength(1);
      expect(host.querySelectorAll('tbody tr')).toHaveLength(150);
      expect(host.textContent).toContain('row-149');
    });

    it('continues rendering when MathJax rejects block and inline formulas', () => {
      const MathJax = {
        tex2svg: vi.fn(() => {
          throw new Error('invalid formula');
        }),
      };
      const engine = new CherryEngine({
        externals: { MathJax },
        engine: {
          syntax: {
            mathBlock: { engine: 'MathJax', selfClosing: false },
            inlineMath: { engine: 'MathJax', selfClosing: false },
          },
        },
      }) as any;

      expect(() => engine.makeHtml('$$\ninvalid block\n$$\n\n$invalid inline$')).not.toThrow();
      expect(MathJax.tex2svg).toHaveBeenCalled();
    });

    it('removes the stream cursor placeholder from chart data only', () => {
      let capturedTable = null as any;
      class ChartRenderer {
        render(_type, _options, tableObject) {
          capturedTable = tableObject;
          return '<div class="chart"></div>';
        }
      }
      const table = new Table({
        externals: {},
        config: {
          enableChart: true,
          selfClosing: false,
          chartRenderEngine: ChartRenderer,
          externals: [],
        },
        cherry: undefined,
      }) as any;
      table.$engine = { hash: (value) => value.length.toString(), $cherry: {} };
      const sentenceMakeFunc = (value) => ({ html: value });

      table.$parseTable([':bar:|value', '---|---', 'name|12CHERRYFLOWSESSIONCURSOR'], sentenceMakeFunc, 3);

      expect(capturedTable.rows[0][1]).toBe('12');
    });

    it('exports a complete UTF-8 HTML document and revokes its object URL', () => {
      const blobParts = [] as any[];
      const BlobMock = vi.fn(function Blob(parts, options) {
        blobParts.push({ parts, options });
      });
      const createObjectURL = vi.fn(() => 'blob:super-doc');
      const revokeObjectURL = vi.fn();
      vi.stubGlobal('Blob', BlobMock);
      vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

      exportHTMLFile('<main>你好</main>', 'report <draft>');

      expect(blobParts[0].options.type).toBe('text/html;charset=utf-8');
      expect(blobParts[0].parts[0]).toContain('<meta charset="UTF-8">');
      expect(blobParts[0].parts[0]).toContain('<title>report &lt;draft&gt;</title>');
      expect(blobParts[0].parts[0]).toContain('<main>你好</main>');
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:super-doc');
    });
  });
});
