import { afterEach, describe, expect, it, vi } from 'vitest';
import CherryEngine, { enqueueMermaidRender } from '../../src/index.engine.core';
import MermaidCodeEngine from '../../src/addons/cherry-code-block-mermaid-plugin';
import WysiwygEditor from '../../src/WysiwygEditor';

const markdown = (source = 'graph TD; A-->B') => `\`\`\`mermaid\n${source}\n\`\`\``;

function createMermaid(render = undefined as any) {
  return {
    initialize: vi.fn(),
    render:
      render ||
      vi.fn(async (id: string) => ({
        svg: `<svg id="${id}"><text>graph</text></svg>`,
      })),
  };
}

function createEngine(plugin: MermaidCodeEngine, callback = vi.fn(), codeBlock = {}) {
  const engine = new CherryEngine({
    callback: { afterAsyncRender: callback },
    engine: { syntax: { codeBlock: { ...codeBlock, customRenderer: { mermaid: plugin } } } },
  }) as any;
  return { engine, callback };
}

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(() => {
  document.querySelectorAll('[data-cherry-mermaid-src], .mermaid-test-canvas').forEach((element) => element.remove());
  delete (window as any).mermaid;
  delete (window as any).mermaidAPI;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('MermaidCodeEngine', () => {
  it('exports the cross-bundle Mermaid render queue from the core entry', async () => {
    const order: string[] = [];
    const mermaid = {};
    await Promise.all([
      enqueueMermaidRender(mermaid, async () => order.push('first')),
      enqueueMermaidRender(mermaid, async () => order.push('second')),
    ]);
    expect(order).toEqual(['first', 'second']);
  });

  it('uses an explicitly injected v11 API without injecting a script', async () => {
    const mermaid = createMermaid();
    const { engine, callback } = createEngine(new MermaidCodeEngine({ mermaid }));

    const initial = engine.makeHtml(markdown());
    expect(initial).toContain('data-type="mermaid"');
    expect(document.querySelector('[data-cherry-mermaid-src]')).toBeNull();
    await flush();

    expect(mermaid.initialize).toHaveBeenCalledTimes(1);
    expect(mermaid.render).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback.mock.calls[0][1]).toContain('<svg');
  });

  it('prefers an explicit Mermaid module over a competing global API', async () => {
    const explicit = createMermaid();
    const global = createMermaid();
    (window as any).mermaid = global;
    const { engine } = createEngine(new MermaidCodeEngine({ mermaid: explicit }));

    engine.makeHtml(markdown());
    await flush();

    expect(explicit.render).toHaveBeenCalledTimes(1);
    expect(global.render).not.toHaveBeenCalled();
  });

  it('supports the legacy mermaid.mermaidAPI explicit injection shape', async () => {
    const render = vi.fn(function legacyRender(_id, _source, callback, _canvas) {
      callback('<svg>legacy-module</svg>');
    });
    const legacy = { initialize: vi.fn(), render };
    const { engine, callback } = createEngine(new MermaidCodeEngine({ mermaid: { mermaidAPI: legacy } }));

    const html = engine.makeHtml(markdown());

    expect(render).toHaveBeenCalledTimes(1);
    expect(html).toContain('<svg>legacy-module</svg>');
    expect(callback.mock.calls[0][1]).toContain('<svg>legacy-module</svg>');
  });

  it('falls back once without Mermaid or an opted-in source', () => {
    const { engine, callback } = createEngine(new MermaidCodeEngine());
    const html = engine.makeHtml(markdown());

    expect(html).toContain('data-type="mermaid"');
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback.mock.calls[0][1]).toContain('data-type="mermaid"');
  });

  it('renders identical Mermaid fences independently', async () => {
    let renderNumber = 0;
    const mermaid = createMermaid(vi.fn(async () => ({ svg: `<svg>${++renderNumber}</svg>` })));
    const { engine, callback } = createEngine(new MermaidCodeEngine({ mermaid }));

    engine.makeHtml(`${markdown('same')}\n\n${markdown('same')}`);
    await flush();

    expect(mermaid.render).toHaveBeenCalledTimes(2);
    expect(mermaid.render.mock.calls[0][0]).not.toBe(mermaid.render.mock.calls[1][0]);
    const finalHtml = callback.mock.calls[0][1];
    expect(finalHtml).toContain('<svg>1</svg>');
    expect(finalHtml).toContain('<svg>2</svg>');
    expect(finalHtml).not.toContain('cherry-code-block');
  });

  it('serialises two plugin instances sharing Mermaid and reapplies each configuration', async () => {
    let active = 0;
    let maximum = 0;
    const mermaid = createMermaid(
      vi.fn(async () => {
        active += 1;
        maximum = Math.max(maximum, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return { svg: '<svg>ok</svg>' };
      }),
    );
    const one = createEngine(new MermaidCodeEngine({ mermaid, theme: 'dark' }));
    const two = createEngine(new MermaidCodeEngine({ mermaid, theme: 'default' }));

    one.engine.makeHtml(markdown('one'));
    two.engine.makeHtml(markdown('two'));
    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(maximum).toBe(1);
    expect(mermaid.initialize.mock.calls.map(([config]: any[]) => config.theme)).toEqual(['dark', 'default']);
  });

  it('removes a pending async canvas immediately when its Engine is destroyed', async () => {
    let resolveRender: (value: { svg: string }) => void = () => undefined;
    const mermaid = createMermaid(
      vi.fn(
        () =>
          new Promise<{ svg: string }>((resolve) => {
            resolveRender = resolve;
          }),
      ),
    );
    const container = document.createElement('section');
    document.body.appendChild(container);
    const { engine, callback } = createEngine(new MermaidCodeEngine({ mermaid, mermaidCanvasAppendDom: container }));

    engine.makeHtml(markdown());
    await flush();
    expect(container.firstElementChild).not.toBeNull();
    engine.destroy();
    expect(container.childElementCount).toBe(0);
    resolveRender({ svg: '<svg>late</svg>' });
    await flush();
    expect(callback).not.toHaveBeenCalled();
    engine.makeHtml(markdown('again'));
    await flush();
    expect(container.firstElementChild).not.toBeNull();
    engine.destroy();
    expect(container.childElementCount).toBe(0);
    container.remove();
  });

  it('does not apply a stale WYSIWYG Mermaid preview after destroy', async () => {
    let resolveRender: (value: { svg: string }) => void = () => undefined;
    const mermaid = createMermaid(
      vi.fn(
        () =>
          new Promise<{ svg: string }>((resolve) => {
            resolveRender = resolve;
          }),
      ),
    );
    const wrapper = document.createElement('div');
    document.body.appendChild(wrapper);
    const editor = new WysiwygEditor({
      $cherry: {
        wrapperDom: wrapper,
        options: {
          engine: { syntax: { codeBlock: { customRenderer: { mermaid: { mermaidAPIRefs: mermaid } } } } },
        },
      },
      editorDom: document.createElement('div'),
    } as any);
    const crepeOptions: any = {};
    editor._configureMermaidPreview(crepeOptions);
    const applyPreview = vi.fn();

    crepeOptions.featureConfigs['code-mirror'].renderPreview('mermaid', 'graph TD; A-->B', applyPreview);
    await flush();
    editor.destroy();
    expect(wrapper.querySelectorAll('div')).toHaveLength(0);
    resolveRender({ svg: '<svg>late</svg>' });
    await flush();

    expect(applyPreview).not.toHaveBeenCalled();
    wrapper.remove();
  });

  it('loads a trusted UMD script once for two instances and resumes both', async () => {
    const source = 'https://cdn.example.test/mermaid.js';
    const one = createEngine(new MermaidCodeEngine({ src: source }));
    const two = createEngine(new MermaidCodeEngine({ src: source }));

    one.engine.makeHtml(markdown('one'));
    two.engine.makeHtml(markdown('two'));
    const script = document.querySelector(`[data-cherry-mermaid-src="${source}"]`) as HTMLScriptElement;
    expect(script).not.toBeNull();
    expect(document.querySelectorAll('[data-cherry-mermaid-src]')).toHaveLength(1);
    (window as any).mermaid = createMermaid();
    script.dispatchEvent(new Event('load'));
    await flush();

    expect(one.callback).toHaveBeenCalledTimes(1);
    expect(two.callback).toHaveBeenCalledTimes(1);
    expect(one.callback.mock.calls[0][1]).toContain('<svg');
    expect(two.callback.mock.calls[0][1]).toContain('<svg');
  });

  it('deduplicates equivalent relative and absolute script URLs', async () => {
    const relative = '/assets/mermaid.js';
    const absolute = new URL(relative, document.baseURI).href;
    const one = createEngine(new MermaidCodeEngine({ src: relative }));
    const two = createEngine(new MermaidCodeEngine({ src: absolute }));

    one.engine.makeHtml(markdown('one'));
    two.engine.makeHtml(markdown('two'));
    const script = document.querySelector(`[data-cherry-mermaid-src="${absolute}"]`) as HTMLScriptElement;
    expect(script).not.toBeNull();
    expect(document.querySelectorAll('[data-cherry-mermaid-src]')).toHaveLength(1);
    (window as any).mermaid = createMermaid();
    script.dispatchEvent(new Event('load'));
    await flush();

    expect(one.callback).toHaveBeenCalledTimes(1);
    expect(two.callback).toHaveBeenCalledTimes(1);
  });

  it('honours the documented code-block Mermaid src configuration', async () => {
    const source = 'https://cdn.example.test/configured.js';
    const { engine, callback } = createEngine(new MermaidCodeEngine(), vi.fn(), { mermaid: { src: source } });

    engine.makeHtml(markdown());
    const script = document.querySelector(`[data-cherry-mermaid-src="${source}"]`) as HTMLScriptElement;
    expect(script).not.toBeNull();
    (window as any).mermaid = createMermaid();
    script.dispatchEvent(new Event('load'));
    await flush();

    expect(callback.mock.calls[0][1]).toContain('<svg');
  });

  it('supports a dynamically loaded legacy callback API', async () => {
    const source = 'https://cdn.example.test/mermaid-v9.js';
    const legacyRender = vi.fn(function renderLegacy(_id, _source, callback, _canvas) {
      callback('<svg>legacy</svg>');
    });
    const legacy = { initialize: vi.fn(), render: legacyRender };
    const { engine, callback } = createEngine(new MermaidCodeEngine({ src: source }));

    engine.makeHtml(markdown());
    const script = document.querySelector(`[data-cherry-mermaid-src="${source}"]`) as HTMLScriptElement;
    (window as any).mermaidAPI = legacy;
    script.dispatchEvent(new Event('load'));
    await flush();

    expect(legacyRender).toHaveBeenCalledTimes(1);
    expect(callback.mock.calls[0][1]).toContain('<svg>legacy</svg>');
  });

  it('removes an onload script that does not expose Mermaid and returns the fallback once', async () => {
    const source = 'https://cdn.example.test/no-api.js';
    const { engine, callback } = createEngine(new MermaidCodeEngine({ src: source }));

    engine.makeHtml(markdown());
    const script = document.querySelector(`[data-cherry-mermaid-src="${source}"]`) as HTMLScriptElement;
    script.dispatchEvent(new Event('load'));
    await flush();

    expect(document.querySelector(`[data-cherry-mermaid-src="${source}"]`)).toBeNull();
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback.mock.calls[0][1]).toContain('data-type="mermaid"');
  });

  it('reinjects a same-source script after HMR removes its script and API', async () => {
    const source = 'https://cdn.example.test/hmr.js';
    const first = createEngine(new MermaidCodeEngine({ src: source }));
    first.engine.makeHtml(markdown());
    const initial = document.querySelector(`[data-cherry-mermaid-src="${source}"]`) as HTMLScriptElement;
    (window as any).mermaid = createMermaid();
    initial.dispatchEvent(new Event('load'));
    await flush();

    initial.remove();
    delete (window as any).mermaid;
    const second = createEngine(new MermaidCodeEngine({ src: source }));
    second.engine.makeHtml(markdown());
    const replacement = document.querySelector(`[data-cherry-mermaid-src="${source}"]`) as HTMLScriptElement;
    expect(replacement).not.toBeNull();
    expect(replacement).not.toBe(initial);
    (window as any).mermaid = createMermaid();
    replacement.dispatchEvent(new Event('load'));
    await flush();

    expect(second.callback.mock.calls[0][1]).toContain('<svg');
  });

  it('cleans a timed out script and allows a later retry', async () => {
    vi.useFakeTimers();
    const source = 'https://cdn.example.test/retry.js';
    const failed = createEngine(new MermaidCodeEngine({ src: source }));
    failed.engine.makeHtml(markdown());
    expect(document.querySelector(`[data-cherry-mermaid-src="${source}"]`)).not.toBeNull();
    await vi.advanceTimersByTimeAsync(15000);

    expect(document.querySelector(`[data-cherry-mermaid-src="${source}"]`)).toBeNull();
    expect(failed.callback).toHaveBeenCalledTimes(1);

    const recovered = createEngine(new MermaidCodeEngine({ src: source }));
    recovered.engine.makeHtml(markdown());
    const retry = document.querySelector(`[data-cherry-mermaid-src="${source}"]`) as HTMLScriptElement;
    (window as any).mermaid = createMermaid();
    retry.dispatchEvent(new Event('load'));
    await vi.runAllTimersAsync();

    expect(recovered.callback).toHaveBeenCalledTimes(1);
    expect(recovered.callback.mock.calls[0][1]).toContain('<svg');
  });

  it('does not inject unsafe dynamic script schemes', () => {
    for (const src of ['data:text/javascript,alert(1)', 'javascript:alert(1)']) {
      const { engine } = createEngine(new MermaidCodeEngine({ src }));
      engine.makeHtml(markdown());
    }
    expect(document.querySelector('[data-cherry-mermaid-src]')).toBeNull();
  });
});
