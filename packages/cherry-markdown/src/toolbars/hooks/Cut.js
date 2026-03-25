import MenuBase from '@/toolbars/MenuBase';

const SCISSORS_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>';

export default class Cut extends MenuBase {
  constructor($cherry) {
    super($cherry);
    this.setName('cut', 'cut');
    this.$currentMenuOptions = {
      name: 'cut',
      icon: { type: 'svg', content: SCISSORS_SVG },
    };
    this.updateMarkdown = false;
  }

  /**
   * 所有模式统一：先聚焦编辑器，再用浏览器原生 cut
   */
  onClick() {
    this.$focusEditor();
    document.execCommand('cut');
  }

  $focusEditor() {
    if (this.$cherry.status?.wysiwyg === 'show') {
      // WYSIWYG: 聚焦 contenteditable 区域
      const el = this.$cherry.wrapperDom.querySelector('.milkdown [contenteditable]')
        || this.$cherry.wrapperDom.querySelector('[contenteditable]');
      if (el) el.focus();
    } else {
      const cm = this.$cherry.editor?.editor;
      if (cm) cm.focus();
    }
  }

  $getHasSelection() {
    if (this.$cherry.status?.wysiwyg === 'show') {
      return (window.getSelection()?.toString() || '').length > 0;
    }
    const cm = this.$cherry.editor?.editor;
    return cm ? cm.somethingSelected() : false;
  }

  afterInit(btn) {
    this.dom.classList.add('disabled');
    const cm = this.$cherry.editor?.editor;
    if (cm) {
      cm.on('cursorActivity', () => this.$updateDisabled());
    }
    document.addEventListener('selectionchange', () => this.$updateDisabled());
  }

  $updateDisabled() {
    if (!this.dom) return;
    this.dom.classList.toggle('disabled', !this.$getHasSelection());
  }
}
