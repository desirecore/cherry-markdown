import MenuBase from '@/toolbars/MenuBase';
import { copyToClip } from '@/utils/copy';

export default class CopySelection extends MenuBase {
  constructor($cherry) {
    super($cherry);
    this.setName('copySelection', 'copy');
    this.updateMarkdown = false;
    this.lastIconOuterHtml = '';
  }

  $getSelection() {
    if (this.$cherry.status?.wysiwyg === 'show') {
      return window.getSelection()?.toString() || '';
    }
    const cm = this.$cherry.editor?.editor;
    return cm ? cm.getSelection() : '';
  }

  onClick() {
    const selection = this.$getSelection();
    const markdownText = selection || this.$cherry.getMarkdown();
    if (!markdownText) return;

    const html = this.$cherry.engine.makeHtml(markdownText);
    copyToClip(markdownText, html);
    this.$showSuccess();
  }

  $showSuccess() {
    if (!this.dom || !this.dom.lastElementChild) return;
    if (!this.lastIconOuterHtml) {
      this.lastIconOuterHtml = this.dom.lastElementChild.outerHTML;
    }
    this.dom.lastElementChild.outerHTML = '<i class="ch-icon ch-icon-ok"></i>';
    setTimeout(() => {
      if (this.lastIconOuterHtml && this.dom.lastElementChild) {
        this.dom.lastElementChild.outerHTML = this.lastIconOuterHtml;
        this.lastIconOuterHtml = '';
      }
    }, 1500);
  }
}
