import { afterEach, describe, expect, it, vi } from 'vitest';
import Cherry from '../../src/Cherry';
import CherryEvent from '../../src/Event';
import Previewer from '../../src/Previewer';
import Toolbar from '../../src/toolbars/Toolbar';
import SwitchWysiwyg from '../../src/toolbars/hooks/SwitchWysiwyg';

type EditorMode = 'edit&preview' | 'editOnly' | 'previewOnly' | 'wysiwyg';
const activeToolbars = new Set<Toolbar & Record<string, any>>();

const createModeHarness = () => {
  const event = new CherryEvent('toolbar-mode-contract');
  const editorDom = document.createElement('div');
  editorDom.className = 'cherry-editor';
  const previewerDom = document.createElement('div');
  previewerDom.className = 'cherry-previewer';
  const dragDom = document.createElement('div');
  const wysiwygDom = document.createElement('div');
  wysiwygDom.className = 'cherry-wysiwyg cherry-wysiwyg--hidden';
  const status = { editor: 'show', previewer: 'show', wysiwyg: 'hide' };
  event.on('editorOpen', () => {
    status.editor = 'show';
  });
  event.on('editorClose', () => {
    status.editor = 'hide';
  });
  event.on('previewerOpen', () => {
    status.previewer = 'show';
  });
  event.on('previewerClose', () => {
    status.previewer = 'hide';
  });

  const previewer = Object.create(Previewer.prototype) as Previewer & Record<string, any>;
  Object.assign(previewer, {
    options: {
      previewerDom,
      virtualDragLineDom: dragDom,
      enablePreviewerBubble: false,
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
    setRealLayout: (editorWidth: string, previewerWidth: string) => {
      editorDom.style.width = editorWidth;
      previewerDom.style.width = previewerWidth;
    },
  });

  const wrapperDom = document.createElement('div');
  const cherry = Object.create(Cherry.prototype) as Cherry & Record<string, any>;
  Object.assign(cherry, {
    instanceId: 'toolbar-mode-contract',
    status,
    options: {
      wysiwyg: { enabled: true },
      engine: { global: { flowSessionContext: false } },
      toolbars: { toolbarTabs: [{ name: 'view', buttons: ['switchWysiwyg'] }] },
      callback: {},
    },
    locale: {
      modelEditPreview: 'Split',
      modelEditOnly: 'Edit',
      modelPreviewOnly: 'Preview',
      modelWysiwyg: 'WYSIWYG',
    },
    editor: {
      options: { editorDom },
      editor: {
        getValue: vi.fn(() => '# compact'),
        setValue: vi.fn(),
        getSelections: vi.fn(() => ['']),
        replaceSelections: vi.fn(),
        focus: vi.fn(),
      },
    },
    previewer,
    wysiwygDom,
    wysiwygEditor: { initialized: true, setValue: vi.fn(), getValue: vi.fn(() => '# compact') },
    wysiwygInitPromise: null,
    modelSwitchSequence: 0,
    wrapperDom,
    $event: event,
    $hideWysiwygSwitchBtn: vi.fn(),
    $toggleWysiwygToolbarButtons: vi.fn(),
  });
  previewer.$cherry = cherry;

  const toolbar = Object.create(Toolbar.prototype) as Toolbar & Record<string, any>;
  const toolbarDom = document.createElement('div');
  wrapperDom.appendChild(toolbarDom);
  const panel = document.createElement('div');
  toolbarDom.appendChild(panel);
  const hook = new SwitchWysiwyg(cherry);
  Object.assign(toolbar, {
    $cherry: cherry,
    options: { dom: toolbarDom },
    menus: { hooks: { switchWysiwyg: hook } },
    hideAllSubMenu: vi.fn(),
    currentActiveSubMenu: null,
    showOrHideToolbar: vi.fn(),
  });
  cherry.toolbar = toolbar;
  activeToolbars.add(toolbar);
  toolbar.$renderRibbonButton(panel, 'switchWysiwyg');
  toolbar.init();

  const buttons = Array.from(panel.querySelectorAll<HTMLElement>('[data-editor-mode]'));
  const buttonFor = (mode: EditorMode) => buttons.find((button) => button.dataset.editorMode === mode)!;

  return { cherry, event, toolbar, toolbarDom, wrapperDom, hook, buttons, buttonFor };
};

const expectSelectedMode = (harness: ReturnType<typeof createModeHarness>, mode: EditorMode) => {
  harness.buttons.forEach((button) => {
    const selected = button.dataset.editorMode === mode;
    expect(button.classList.contains('cherry-toolbar-button--selected')).toBe(selected);
    expect(button.getAttribute('aria-pressed')).toBe(String(selected));
  });
};

describe('toolbar mode commit synchronization', () => {
  afterEach(() => {
    activeToolbars.forEach((toolbar) => toolbar.destroy());
    activeToolbars.clear();
    vi.restoreAllMocks();
  });

  it('renders flattened mode controls as real buttons with an accessible pressed state', async () => {
    const harness = createModeHarness();

    expect(harness.buttons).toHaveLength(4);
    harness.buttons.forEach((button) => {
      expect(button.tagName).toBe('BUTTON');
      expect(button.getAttribute('type')).toBe('button');
    });

    await harness.cherry.switchModel('edit&preview');
    expectSelectedMode(harness, 'edit&preview');
  });

  it('keeps programmatic 601 -> 599 -> 600/601 mode commits atomically synchronized', async () => {
    const harness = createModeHarness();

    await harness.cherry.switchModel('edit&preview');
    expectSelectedMode(harness, 'edit&preview');

    const completion = harness.cherry.switchModel('previewOnly');
    expectSelectedMode(harness, 'previewOnly');
    await expect(completion).resolves.toBe(true);

    await harness.cherry.switchModel('edit&preview');
    expectSelectedMode(harness, 'edit&preview');
  });

  it('renders dropdown mode controls as buttons and keeps their click contract synchronized', () => {
    const harness = createModeHarness();
    const dropdown = document.createElement('div');
    dropdown.className = 'cherry-dropdown';
    harness.hook.getSubMenuConfig().forEach((config) => {
      dropdown.appendChild(harness.hook.createSubBtnByConfig(config));
    });
    harness.wrapperDom.appendChild(dropdown);
    harness.toolbar.$syncModeControls('edit&preview');
    const buttons = Array.from(dropdown.querySelectorAll<HTMLButtonElement>('[data-editor-mode]'));

    expect(buttons).toHaveLength(4);
    buttons.forEach((button) => {
      expect(button.type).toBe('button');
      expect(button.getAttribute('aria-pressed')).toBe(String(button.dataset.editorMode === 'edit&preview'));
    });

    buttons.find((button) => button.dataset.editorMode === 'previewOnly')!.click();
    expect(buttons.find((button) => button.dataset.editorMode === 'previewOnly')!.getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('does not move selection when beforeSwitchModel rejects the requested mode', async () => {
    const harness = createModeHarness();
    await harness.cherry.switchModel('edit&preview');
    harness.cherry.options.callback.beforeSwitchModel = () => false;

    await expect(harness.cherry.switchModel('previewOnly')).resolves.toBe(false);

    expectSelectedMode(harness, 'edit&preview');
  });

  it('stops reacting to mode commits after the toolbar is destroyed', async () => {
    const harness = createModeHarness();
    await harness.cherry.switchModel('editOnly');
    expectSelectedMode(harness, 'editOnly');

    harness.toolbar.destroy();
    harness.event.emit('modeCommitted', { mode: 'previewOnly', previousMode: 'editOnly' });

    expectSelectedMode(harness, 'editOnly');
  });
});
