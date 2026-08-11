import { afterEach, describe, expect, it, vi } from 'vitest';
import WysiwygEditor from '../../src/WysiwygEditor';

const createDeferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

describe('WysiwygEditor lifecycle', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not register listeners when a pending Crepe init resolves after destroy', async () => {
    const deferred = createDeferred();
    const instances: FakeCrepe[] = [];

    class FakeCrepe {
      editor = { use: vi.fn() };

      create = vi.fn(() => deferred.promise);

      destroy = vi.fn();

      on = vi.fn((register: (listener: { markdownUpdated: ReturnType<typeof vi.fn> }) => void) => {
        register({ markdownUpdated: vi.fn() });
      });

      constructor() {
        instances.push(this);
      }
    }

    const editorDom = document.createElement('div');
    document.body.appendChild(editorDom);
    const emit = vi.fn();
    const editor = new WysiwygEditor({
      $cherry: {
        options: {
          wysiwyg: { Crepe: FakeCrepe, crepeOptions: {} },
          engine: {},
        },
        $event: { emit },
      },
      editorDom,
      value: '# pending',
    });
    const documentAddSpy = vi.spyOn(document, 'addEventListener');
    const editorAddSpy = vi.spyOn(editorDom, 'addEventListener');

    const initialization = editor.init();
    await Promise.resolve();
    expect(instances).toHaveLength(1);

    editor.destroy();
    deferred.resolve();

    await expect(initialization).resolves.toBe(false);
    expect(editor.initialized).toBe(false);
    expect(editor.crepe).toBeNull();
    expect(instances[0].destroy).toHaveBeenCalledTimes(2);
    expect(documentAddSpy.mock.calls.filter(([name]) => name === 'selectionchange')).toHaveLength(0);
    expect(editorAddSpy.mock.calls.filter(([name]) => name === 'click' || name === 'scroll')).toHaveLength(0);

    document.dispatchEvent(new Event('selectionchange'));
    editorDom.dispatchEvent(new Event('scroll'));
    expect(emit).not.toHaveBeenCalled();
    editorDom.remove();
  });

  it('does not let an obsolete init clear or disable a newer Crepe generation', async () => {
    const deferreds = [createDeferred(), createDeferred()];
    const instances: FakeCrepe[] = [];

    class FakeCrepe {
      editor = { use: vi.fn() };

      deferred!: ReturnType<typeof createDeferred>;

      create = vi.fn(() => this.deferred.promise);

      destroy = vi.fn();

      on = vi.fn((register: (listener: { markdownUpdated: ReturnType<typeof vi.fn> }) => void) => {
        register({ markdownUpdated: vi.fn() });
      });

      constructor() {
        this.deferred = deferreds[instances.length];
        instances.push(this);
      }
    }

    const editorDom = document.createElement('div');
    document.body.appendChild(editorDom);
    const emit = vi.fn();
    const editor = new WysiwygEditor({
      $cherry: {
        options: {
          wysiwyg: { Crepe: FakeCrepe, crepeOptions: {} },
          engine: {},
        },
        $event: { emit },
      },
      editorDom,
      value: '# replacement',
    });

    const obsoleteInitialization = editor.init();
    editor.destroy();
    const currentInitialization = editor.init();

    deferreds[1].resolve();
    await expect(currentInitialization).resolves.toBe(true);
    expect(editor.crepe).toBe(instances[1]);
    expect(editor.initialized).toBe(true);

    deferreds[0].resolve();
    await expect(obsoleteInitialization).resolves.toBe(false);
    expect(editor.crepe).toBe(instances[1]);
    expect(editor.initialized).toBe(true);

    document.dispatchEvent(new Event('selectionchange'));
    expect(emit).toHaveBeenCalledWith('wysiwygSelectionChange');
    expect(instances[0].destroy).toHaveBeenCalledTimes(2);
    expect(instances[1].destroy).not.toHaveBeenCalled();

    editor.destroy();
    expect(instances[1].destroy).toHaveBeenCalledOnce();
    editorDom.remove();
  });
});
