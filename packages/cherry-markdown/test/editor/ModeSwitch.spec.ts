import { afterEach, describe, expect, it, vi } from 'vitest';
import Cherry from '../../src/Cherry';
import CherryEvent from '../../src/Event';
import Previewer from '../../src/Previewer';

type EditorMode = 'edit&preview' | 'editOnly' | 'previewOnly' | 'wysiwyg';

const createPreviewerHarness = () => {
  const editorDom = document.createElement('div');
  editorDom.className = 'cherry-editor';
  const previewerDom = document.createElement('div');
  previewerDom.className = 'cherry-previewer';
  const dragDom = document.createElement('div');
  dragDom.className = 'cherry-drag';
  const status = { editor: 'show', previewer: 'show', wysiwyg: 'hide' };
  const emit = vi.fn((name: string) => {
    if (name === 'editorOpen') status.editor = 'show';
    if (name === 'editorClose') status.editor = 'hide';
    if (name === 'previewerOpen') status.previewer = 'show';
    if (name === 'previewerClose') status.previewer = 'hide';
  });

  const previewer = Object.create(Previewer.prototype) as Previewer & {
    setRealLayout: (editorWidth: string, previewerWidth: string) => void;
  };
  Object.assign(previewer, {
    options: {
      previewerDom,
      virtualDragLineDom: dragDom,
      enablePreviewerBubble: true,
      previewerCache: {
        html: '',
        htmlChanged: false,
        layout: { editorPercentage: '50%', previewerPercentage: '50%' },
      },
    },
    editor: {
      options: { editorDom },
      editor: { refresh: vi.fn() },
    },
    $cherry: {
      status,
      options: { engine: { global: { flowSessionContext: false } } },
      $event: { emit },
      wrapperDom: document.createElement('div'),
    },
    setRealLayout: (editorWidth: string, previewerWidth: string) => {
      editorDom.style.width = editorWidth;
      previewerDom.style.width = previewerWidth;
    },
  });

  return { previewer, editorDom, previewerDom, dragDom, status, emit };
};

const createDeferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

const createCherryHarness = () => {
  const modeHarness = createPreviewerHarness();
  const deferred = createDeferred<boolean>();
  const wysiwygDom = document.createElement('div');
  wysiwygDom.className = 'cherry-wysiwyg cherry-wysiwyg--hidden';
  const wysiwygEditor = {
    initialized: false,
    getValue: vi.fn(() => '# compact'),
    setValue: vi.fn(),
  };
  const initPromise = deferred.promise.then((result) => {
    wysiwygEditor.initialized = result;
    return result;
  });

  const cherry = Object.create(Cherry.prototype) as Cherry & Record<string, any>;
  Object.assign(cherry, {
    status: modeHarness.status,
    options: {
      wysiwyg: { enabled: true },
      engine: { global: { flowSessionContext: false } },
      toolbars: { toolbarTabs: [{ name: 'view', buttons: ['switchWysiwyg'] }] },
      callback: {},
    },
    editor: {
      options: { editorDom: modeHarness.editorDom },
      editor: {
        getValue: vi.fn(() => '# compact'),
        setValue: vi.fn(),
      },
    },
    previewer: modeHarness.previewer,
    wysiwygDom,
    wysiwygEditor,
    wysiwygInitPromise: initPromise,
    modelSwitchSequence: 0,
    toolbar: { showOrHideToolbar: vi.fn() },
    $event: modeHarness.previewer.$cherry.$event,
    $hideWysiwygSwitchBtn: vi.fn(),
    $toggleWysiwygToolbarButtons: vi.fn(),
  });
  modeHarness.previewer.$cherry = cherry;

  return { cherry, deferred, wysiwygDom, wysiwygEditor, ...modeHarness };
};

const createLazyWysiwygHarness = (outcomes: Array<'success' | 'failure'>) => {
  vi.stubGlobal('BUILD_ENV', 'production');
  const harness = createCherryHarness();
  const instances: Array<{
    create: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  }> = [];

  class FakeCrepe {
    editor = { use: vi.fn() };

    create = vi.fn(async () => {
      const outcome = outcomes.shift() ?? 'success';
      if (outcome === 'failure') throw new Error('deterministic Crepe create failure');
    });

    destroy = vi.fn();

    on = vi.fn((register: (listener: { markdownUpdated: ReturnType<typeof vi.fn> }) => void) => {
      register({ markdownUpdated: vi.fn() });
    });

    getMarkdown = vi.fn(() => '# compact');

    constructor() {
      instances.push(this);
    }
  }

  harness.cherry.wysiwygEditor = null;
  harness.cherry.wysiwygInitPromise = null;
  harness.cherry.options.wysiwyg = {
    enabled: true,
    Crepe: FakeCrepe,
    crepeOptions: {},
  };

  return { ...harness, instances };
};

const expectMode = (harness: ReturnType<typeof createCherryHarness>, mode: EditorMode) => {
  const { editorDom, previewerDom, wysiwygDom, status } = harness;
  if (mode === 'edit&preview') {
    expect(editorDom.classList.contains('cherry-editor--hidden')).toBe(false);
    expect(editorDom.classList.contains('cherry-editor--full')).toBe(false);
    expect(previewerDom.classList.contains('cherry-previewer--hidden')).toBe(false);
    expect(previewerDom.classList.contains('cherry-previewer--full')).toBe(false);
    expect(wysiwygDom.classList.contains('cherry-wysiwyg--hidden')).toBe(true);
    expect(status).toEqual({ editor: 'show', previewer: 'show', wysiwyg: 'hide' });
  } else if (mode === 'editOnly') {
    expect(editorDom.classList.contains('cherry-editor--hidden')).toBe(false);
    expect(editorDom.classList.contains('cherry-editor--full')).toBe(true);
    expect(previewerDom.classList.contains('cherry-previewer--hidden')).toBe(true);
    expect(previewerDom.classList.contains('cherry-previewer--full')).toBe(false);
    expect(wysiwygDom.classList.contains('cherry-wysiwyg--hidden')).toBe(true);
    expect(status).toEqual({ editor: 'show', previewer: 'hide', wysiwyg: 'hide' });
  } else if (mode === 'previewOnly') {
    expect(editorDom.classList.contains('cherry-editor--hidden')).toBe(true);
    expect(editorDom.classList.contains('cherry-editor--full')).toBe(false);
    expect(previewerDom.classList.contains('cherry-previewer--hidden')).toBe(false);
    expect(previewerDom.classList.contains('cherry-previewer--full')).toBe(true);
    expect(wysiwygDom.classList.contains('cherry-wysiwyg--hidden')).toBe(true);
    expect(status).toEqual({ editor: 'hide', previewer: 'show', wysiwyg: 'hide' });
  } else {
    expect(editorDom.classList.contains('cherry-editor--hidden')).toBe(true);
    expect(previewerDom.classList.contains('cherry-previewer--hidden')).toBe(true);
    expect(wysiwygDom.classList.contains('cherry-wysiwyg--hidden')).toBe(false);
    expect(status).toEqual({ editor: 'hide', previewer: 'hide', wysiwyg: 'show' });
  }
};

describe('editor mode DOM state', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('removes full and hidden classes when returning to split mode', () => {
    vi.useFakeTimers();
    const { previewer, editorDom, previewerDom, dragDom } = createPreviewerHarness();

    previewer.previewOnly();
    expect(previewerDom.classList.contains('cherry-previewer--full')).toBe(true);

    previewer.editOnly();
    expect(editorDom.classList.contains('cherry-editor--full')).toBe(true);
    expect(previewerDom.classList.contains('cherry-previewer--full')).toBe(false);

    previewer.previewOnly();
    previewer.editAndPreview();
    vi.runAllTimers();

    expect(editorDom.classList.contains('cherry-editor--hidden')).toBe(false);
    expect(editorDom.classList.contains('cherry-editor--full')).toBe(false);
    expect(previewerDom.classList.contains('cherry-previewer--hidden')).toBe(false);
    expect(previewerDom.classList.contains('cherry-previewer--full')).toBe(false);
    expect(dragDom.classList.contains('cherry-drag--hidden')).toBe(false);
  });

  it('returns a completion promise and lets beforeSwitchModel block without mutating state', async () => {
    const harness = createCherryHarness();
    const beforeSwitchModel = vi.fn(() => false);
    harness.cherry.options.callback.beforeSwitchModel = beforeSwitchModel;

    const completion = harness.cherry.switchModel('editOnly');

    expect(completion).toBeInstanceOf(Promise);
    await expect(completion).resolves.toBe(false);
    expect(beforeSwitchModel).toHaveBeenCalledWith('editOnly', 'edit&preview');
    expect(harness.cherry.modelSwitchSequence).toBe(0);
    expectMode(harness, 'edit&preview');
    expect(harness.cherry.toolbar.showOrHideToolbar).not.toHaveBeenCalled();
    expect(harness.emit).not.toHaveBeenCalledWith('modeCommitted', expect.anything());
  });

  it('emits one modeCommitted notification after every successful synchronous commit', async () => {
    const harness = createCherryHarness();

    await expect(harness.cherry.switchModel('editOnly')).resolves.toBe(true);
    await expect(harness.cherry.switchModel('previewOnly')).resolves.toBe(true);
    await expect(harness.cherry.switchModel('edit&preview')).resolves.toBe(true);

    expect(harness.emit.mock.calls.filter(([name]) => name === 'modeCommitted')).toEqual([
      ['modeCommitted', { mode: 'editOnly', previousMode: 'edit&preview' }],
      ['modeCommitted', { mode: 'previewOnly', previousMode: 'editOnly' }],
      ['modeCommitted', { mode: 'edit&preview', previousMode: 'previewOnly' }],
    ]);
  });

  it('does not notify for a stale WYSIWYG request and only notifies the winning request', async () => {
    const harness = createCherryHarness();

    const staleWysiwyg = harness.cherry.switchModel('wysiwyg');
    await expect(harness.cherry.switchModel('editOnly')).resolves.toBe(true);
    harness.deferred.resolve(true);
    await expect(staleWysiwyg).resolves.toBe(false);

    expect(harness.emit.mock.calls.filter(([name]) => name === 'modeCommitted')).toEqual([
      ['modeCommitted', { mode: 'editOnly', previousMode: 'edit&preview' }],
    ]);
  });

  it('notifies a successful WYSIWYG commit only after initialization finishes', async () => {
    const harness = createCherryHarness();

    const completion = harness.cherry.switchModel('wysiwyg');
    expect(harness.emit).not.toHaveBeenCalledWith('modeCommitted', expect.anything());

    harness.deferred.resolve(true);
    await expect(completion).resolves.toBe(true);

    expect(harness.emit.mock.calls.filter(([name]) => name === 'modeCommitted')).toEqual([
      ['modeCommitted', { mode: 'wysiwyg', previousMode: 'edit&preview' }],
    ]);
  });

  it('treats an already committed WYSIWYG request as an event-free, content-safe no-op after the gate', async () => {
    const harness = createCherryHarness();
    const beforeSwitchModel = vi.fn(() => true);
    harness.cherry.options.callback.beforeSwitchModel = beforeSwitchModel;
    const initialCompletion = harness.cherry.switchModel('wysiwyg');
    harness.deferred.resolve(true);
    await expect(initialCompletion).resolves.toBe(true);
    harness.wysiwygEditor.getValue.mockReturnValue('# current milkdown content');
    harness.cherry.editor.editor.getValue.mockReturnValue('# stale codemirror content');
    beforeSwitchModel.mockClear();
    harness.emit.mockClear();
    harness.cherry.toolbar.showOrHideToolbar.mockClear();
    harness.wysiwygEditor.getValue.mockClear();
    harness.wysiwygEditor.setValue.mockClear();
    harness.cherry.editor.editor.getValue.mockClear();
    harness.cherry.editor.editor.setValue.mockClear();
    const sequence = harness.cherry.modelSwitchSequence;
    const domState = {
      editor: harness.editorDom.className,
      previewer: harness.previewerDom.className,
      drag: harness.dragDom.className,
      wysiwyg: harness.wysiwygDom.className,
    };

    await expect(harness.cherry.switchModel('wysiwyg')).resolves.toBe(true);

    expect(beforeSwitchModel).toHaveBeenCalledOnce();
    expect(beforeSwitchModel).toHaveBeenCalledWith('wysiwyg', 'wysiwyg');
    expect(harness.cherry.modelSwitchSequence).toBe(sequence);
    expect(harness.cherry.editor.editor.getValue).not.toHaveBeenCalled();
    expect(harness.cherry.editor.editor.setValue).not.toHaveBeenCalled();
    expect(harness.wysiwygEditor.getValue).not.toHaveBeenCalled();
    expect(harness.wysiwygEditor.setValue).not.toHaveBeenCalled();
    expect(harness.cherry.toolbar.showOrHideToolbar).not.toHaveBeenCalled();
    expect(harness.emit).not.toHaveBeenCalledWith('modeCommitted', expect.anything());
    expect({
      editor: harness.editorDom.className,
      previewer: harness.previewerDom.className,
      drag: harness.dragDom.className,
      wysiwyg: harness.wysiwygDom.className,
    }).toEqual(domState);
    expectMode(harness, 'wysiwyg');
  });

  it('lets beforeSwitchModel reject an already committed WYSIWYG request without side effects', async () => {
    const harness = createCherryHarness();
    const initialCompletion = harness.cherry.switchModel('wysiwyg');
    harness.deferred.resolve(true);
    await expect(initialCompletion).resolves.toBe(true);
    const sequence = harness.cherry.modelSwitchSequence;
    const beforeSwitchModel = vi.fn(() => false);
    harness.cherry.options.callback.beforeSwitchModel = beforeSwitchModel;
    harness.emit.mockClear();

    await expect(harness.cherry.switchModel('wysiwyg')).resolves.toBe(false);

    expect(beforeSwitchModel).toHaveBeenCalledWith('wysiwyg', 'wysiwyg');
    expect(harness.cherry.modelSwitchSequence).toBe(sequence);
    expect(harness.emit).not.toHaveBeenCalledWith('modeCommitted', expect.anything());
    expectMode(harness, 'wysiwyg');
  });

  it('rejects an invalid mode before sequence, WYSIWYG content, DOM, or toolbar side effects', async () => {
    const harness = createCherryHarness();
    const initialCompletion = harness.cherry.switchModel('wysiwyg');
    harness.deferred.resolve(true);
    await expect(initialCompletion).resolves.toBe(true);
    const beforeSwitchModel = vi.fn();
    harness.cherry.options.callback.beforeSwitchModel = beforeSwitchModel;
    harness.emit.mockClear();
    harness.cherry.toolbar.showOrHideToolbar.mockClear();
    harness.wysiwygEditor.getValue.mockClear();
    harness.wysiwygEditor.setValue.mockClear();
    harness.cherry.editor.editor.setValue.mockClear();
    const sequence = harness.cherry.modelSwitchSequence;
    const status = { ...harness.cherry.status };
    const domState = {
      editor: harness.editorDom.className,
      previewer: harness.previewerDom.className,
      drag: harness.dragDom.className,
      wysiwyg: harness.wysiwygDom.className,
    };

    await expect(harness.cherry.switchModel('invalid' as any)).resolves.toBe(false);

    expect(beforeSwitchModel).not.toHaveBeenCalled();
    expect(harness.cherry.modelSwitchSequence).toBe(sequence);
    expect(harness.wysiwygEditor.getValue).not.toHaveBeenCalled();
    expect(harness.wysiwygEditor.setValue).not.toHaveBeenCalled();
    expect(harness.cherry.editor.editor.setValue).not.toHaveBeenCalled();
    expect(harness.cherry.toolbar.showOrHideToolbar).not.toHaveBeenCalled();
    expect(harness.emit).not.toHaveBeenCalledWith('modeCommitted', expect.anything());
    expect(harness.cherry.status).toEqual(status);
    expect({
      editor: harness.editorDom.className,
      previewer: harness.previewerDom.className,
      drag: harness.dragDom.className,
      wysiwyg: harness.wysiwygDom.className,
    }).toEqual(domState);
    expectMode(harness, 'wysiwyg');
  });

  it.each<EditorMode>(['edit&preview', 'editOnly', 'previewOnly', 'wysiwyg'])(
    'keeps the last %s request after delayed WYSIWYG initialization',
    async (lastMode) => {
      vi.useFakeTimers();
      const harness = createCherryHarness();
      let firstWysCompletion: Promise<boolean> | undefined;

      for (let index = 0; index < 50; index += 1) {
        const completion = harness.cherry.switchModel(index % 2 === 0 ? 'wysiwyg' : 'editOnly');
        if (index === 0) firstWysCompletion = completion;
      }
      const finalCompletion = harness.cherry.switchModel(lastMode);
      harness.deferred.resolve(true);
      await expect(finalCompletion).resolves.toBe(true);
      await expect(firstWysCompletion).resolves.toBe(false);
      vi.runAllTimers();

      expectMode(harness, lastMode);
      expect(harness.cherry.modelSwitchSequence).toBe(51);
      expect(harness.wysiwygEditor.setValue).toHaveBeenCalledTimes(lastMode === 'wysiwyg' ? 1 : 0);
    },
  );

  it('recreates WYSIWYG after the first Crepe initialization fails', async () => {
    const harness = createLazyWysiwygHarness(['failure', 'success']);

    await expect(harness.cherry.switchModel('wysiwyg')).resolves.toBe(false);
    expect(harness.cherry.wysiwygEditor).toBeNull();
    expect(harness.instances).toHaveLength(1);
    expect(harness.instances[0].destroy).toHaveBeenCalledOnce();
    expectMode(harness, 'edit&preview');

    harness.emit.mockClear();
    await expect(harness.cherry.switchModel('wysiwyg')).resolves.toBe(true);
    expect(harness.instances).toHaveLength(2);
    expect(harness.cherry.wysiwygEditor?.initialized).toBe(true);
    expectMode(harness, 'wysiwyg');
    expect(harness.emit.mock.calls.filter(([name]) => name === 'modeCommitted')).toEqual([
      ['modeCommitted', { mode: 'wysiwyg', previousMode: 'edit&preview' }],
    ]);

    harness.cherry.wysiwygEditor?.destroy();
  });

  it('never commits WYSIWYG when Crepe initialization keeps failing', async () => {
    const harness = createLazyWysiwygHarness(['failure', 'failure']);

    await expect(harness.cherry.switchModel('wysiwyg')).resolves.toBe(false);
    await expect(harness.cherry.switchModel('wysiwyg')).resolves.toBe(false);

    expect(harness.instances).toHaveLength(2);
    expect(harness.instances.every((instance) => instance.destroy.mock.calls.length === 1)).toBe(true);
    expect(harness.cherry.wysiwygEditor).toBeNull();
    expectMode(harness, 'edit&preview');
    expect(harness.emit).not.toHaveBeenCalledWith('modeCommitted', expect.anything());
  });

  it('restores the exact previous mode without a commit notification when WYSIWYG initialization fails', async () => {
    const harness = createLazyWysiwygHarness(['failure']);
    await expect(harness.cherry.switchModel('editOnly')).resolves.toBe(true);
    harness.emit.mockClear();
    harness.cherry.toolbar.showOrHideToolbar.mockClear();

    await expect(harness.cherry.switchModel('wysiwyg')).resolves.toBe(false);

    expectMode(harness, 'editOnly');
    expect(harness.emit).not.toHaveBeenCalledWith('modeCommitted', expect.anything());
    expect(harness.cherry.toolbar.showOrHideToolbar).not.toHaveBeenCalled();
  });

  it('binds options.event.modeCommitted to the public event payload', () => {
    const modeCommitted = vi.fn();
    const event = new CherryEvent('mode-contract');
    event.bindCallbacksByOptions({
      callback: {},
      event: { modeCommitted },
    });

    const payload = { mode: 'previewOnly', previousMode: 'edit&preview' };
    event.emit('modeCommitted', payload);

    expect(modeCommitted).toHaveBeenCalledOnce();
    expect(modeCommitted).toHaveBeenCalledWith(payload);
  });

  it('supports public cherry.on/off subscriptions for modeCommitted', () => {
    const event = new CherryEvent('mode-on-off-contract');
    const cherry = Object.create(Cherry.prototype) as Cherry & Record<string, any>;
    cherry.$event = event;
    const listener = vi.fn();
    const payload = { mode: 'previewOnly', previousMode: 'edit&preview' };

    cherry.on('modeCommitted', listener);
    event.emit('modeCommitted', payload);
    cherry.off('modeCommitted', listener);
    event.emit('modeCommitted', { mode: 'editOnly', previousMode: 'previewOnly' });

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(payload);
  });

  it('refreshes a hidden preview, executes mounted callbacks, and waits for async rendering', async () => {
    const markdownText = '# latest WYS content';
    let asyncRenderHandler: ((msg: { markdownText: string; html: string }) => void) | undefined;
    const event = {
      on: vi.fn((_name: string, handler: typeof asyncRenderHandler) => {
        asyncRenderHandler = handler;
      }),
      off: vi.fn(),
    };
    const mountedHook = vi.fn();
    const previewer = {
      refresh: vi.fn(),
      cleanHtmlCache: vi.fn(),
      afterUpdate: vi.fn(() => mountedHook()),
    };
    const cherry = Object.create(Cherry.prototype) as Cherry & Record<string, any>;
    Object.assign(cherry, {
      getValue: vi.fn(() => markdownText),
      engine: { makeHtml: vi.fn(() => '<h1>latest WYS content</h1>') },
      previewer,
      $event: event,
    });

    let resolved = false;
    const completion = cherry.refreshPreviewer().then((result) => {
      resolved = true;
      return result;
    });
    await Promise.resolve();

    expect(resolved).toBe(false);
    expect(previewer.refresh).toHaveBeenCalledWith('<h1>latest WYS content</h1>');
    expect(previewer.cleanHtmlCache).toHaveBeenCalledOnce();
    expect(previewer.afterUpdate).toHaveBeenCalledOnce();
    expect(mountedHook).toHaveBeenCalledOnce();

    asyncRenderHandler?.({ markdownText, html: '<h1>latest WYS content</h1>' });
    await expect(completion).resolves.toBe(true);
    expect(event.off).toHaveBeenCalledWith('afterAsyncRender', asyncRenderHandler);
  });

  it('resolves refreshPreviewer after mounted hooks when rendering completes synchronously', async () => {
    const markdownText = 'plain paragraph';
    let asyncRenderHandler: ((msg: { markdownText: string; html: string }) => void) | undefined;
    const event = {
      on: vi.fn((_name: string, handler: typeof asyncRenderHandler) => {
        asyncRenderHandler = handler;
      }),
      off: vi.fn(),
    };
    const calls: string[] = [];
    const cherry = Object.create(Cherry.prototype) as Cherry & Record<string, any>;
    Object.assign(cherry, {
      getValue: vi.fn(() => markdownText),
      engine: {
        makeHtml: vi.fn(() => {
          calls.push('render');
          asyncRenderHandler?.({ markdownText, html: '<p>plain paragraph</p>' });
          return '<p>plain paragraph</p>';
        }),
      },
      previewer: {
        refresh: vi.fn(() => calls.push('refresh')),
        cleanHtmlCache: vi.fn(() => calls.push('clean-cache')),
        afterUpdate: vi.fn(() => calls.push('mounted')),
      },
      $event: event,
    });

    await expect(cherry.refreshPreviewer()).resolves.toBe(true);
    expect(calls).toEqual(['render', 'refresh', 'clean-cache', 'mounted']);
    expect(event.off).toHaveBeenCalledWith('afterAsyncRender', asyncRenderHandler);
  });

  it('returns false instead of hanging when an async renderer never completes', async () => {
    vi.useFakeTimers();
    let asyncRenderHandler: ((msg: { markdownText: string; html: string }) => void) | undefined;
    const event = {
      on: vi.fn((_name: string, handler: typeof asyncRenderHandler) => {
        asyncRenderHandler = handler;
      }),
      off: vi.fn(),
    };
    const cherry = Object.create(Cherry.prototype) as Cherry & Record<string, any>;
    Object.assign(cherry, {
      getValue: vi.fn(() => 'pending graph'),
      engine: { makeHtml: vi.fn(() => '<div>pending graph</div>') },
      previewer: {
        refresh: vi.fn(),
        cleanHtmlCache: vi.fn(),
        afterUpdate: vi.fn(),
      },
      $event: event,
    });

    const completion = cherry.refreshPreviewer();
    await vi.advanceTimersByTimeAsync(10000);

    await expect(completion).resolves.toBe(false);
    expect(event.off).toHaveBeenCalledWith('afterAsyncRender', asyncRenderHandler);
  });
});
