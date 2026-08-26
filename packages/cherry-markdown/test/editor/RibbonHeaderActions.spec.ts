import { describe, expect, it, vi } from 'vitest';
import Cherry from '../../src/Cherry';
import Toolbar from '../../src/toolbars/Toolbar';

const createHarness = () => {
  const ribbonHeader = document.createElement('div');
  ribbonHeader.className = 'cherry-ribbon-header';
  const cherry = Object.create(Cherry.prototype) as Cherry & Record<string, any>;
  const toolbar = Object.create(Toolbar.prototype) as Toolbar & Record<string, any>;
  Object.assign(cherry, {
    options: { toolbars: { ribbonHeaderActions: false } },
  });
  Object.assign(toolbar, {
    $cherry: cherry,
    ribbonHeader,
    ribbonHeaderActionsDom: null,
  });
  cherry.toolbar = toolbar;
  return { cherry, toolbar, ribbonHeader };
};

describe('Ribbon header actions API', () => {
  it('renders segmented, button and menu actions without an external mount point', () => {
    const { cherry, ribbonHeader } = createHarness();
    const onModeChange = vi.fn();
    const onSave = vi.fn();
    const onExport = vi.fn();

    expect(
      cherry.setRibbonHeaderActions({
        ariaLabel: 'Markdown commands',
        actions: [
          {
            type: 'segmented',
            id: 'diff-mode',
            ariaLabel: 'Diff mode',
            value: 'inline',
            options: [
              { value: 'inline', label: 'Inline' },
              { value: 'side_by_side', label: 'Compare' },
            ],
            onChange: onModeChange,
          },
          { id: 'save', label: 'Save', onClick: onSave },
          {
            type: 'menu',
            id: 'more',
            label: 'More',
            items: [{ id: 'export', label: 'Export', onClick: onExport }],
          },
        ],
      }),
    ).toBe(true);

    const actions = ribbonHeader.querySelector('[role="toolbar"]');
    expect(actions?.getAttribute('aria-label')).toBe('Markdown commands');

    const inline = ribbonHeader.querySelector<HTMLButtonElement>('[title="Inline"]')!;
    const compare = ribbonHeader.querySelector<HTMLButtonElement>('[title="Compare"]')!;
    expect(inline.getAttribute('aria-pressed')).toBe('true');
    compare.click();
    expect(onModeChange).toHaveBeenCalledWith('side_by_side', expect.any(MouseEvent), cherry);

    ribbonHeader.querySelector<HTMLButtonElement>('[aria-label="Save"]')!.click();
    expect(onSave).toHaveBeenCalledWith(expect.any(MouseEvent), cherry);

    const more = ribbonHeader.querySelector<HTMLButtonElement>('[aria-label="More"]')!;
    const menu = ribbonHeader.querySelector<HTMLElement>('[role="menu"]')!;
    expect(menu.hidden).toBe(true);
    more.click();
    expect(more.getAttribute('aria-expanded')).toBe('true');
    expect(menu.hidden).toBe(false);
    ribbonHeader.querySelector<HTMLButtonElement>('[role="menuitem"]')!.click();
    expect(onExport).toHaveBeenCalledWith(expect.any(MouseEvent), cherry);
    expect(menu.hidden).toBe(true);
  });

  it('updates action state in place and rejects invalid configuration', () => {
    const { cherry, ribbonHeader } = createHarness();
    expect(
      cherry.setRibbonHeaderActions({
        actions: [{ id: 'save', label: 'Save', disabled: true }],
      }),
    ).toBe(true);
    expect(ribbonHeader.querySelector<HTMLButtonElement>('[aria-label="Save"]')?.disabled).toBe(true);

    expect(
      cherry.setRibbonHeaderActions({
        actions: [{ id: 'save', label: 'Save', disabled: false }],
      }),
    ).toBe(true);
    expect(ribbonHeader.querySelectorAll('[aria-label="Save"]')).toHaveLength(1);
    expect(ribbonHeader.querySelector<HTMLButtonElement>('[aria-label="Save"]')?.disabled).toBe(false);

    expect(cherry.setRibbonHeaderActions(null as any)).toBe(false);
    expect(cherry.setRibbonHeaderActions(false)).toBe(true);
    expect(ribbonHeader.querySelector('[role="toolbar"]')).toBeNull();
  });
});
