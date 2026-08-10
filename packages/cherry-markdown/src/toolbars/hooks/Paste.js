import MenuBase from '@/toolbars/MenuBase';
import htmlParser from '@/utils/htmlparser';

const CLIPBOARD_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>';

export default class Paste extends MenuBase {
  constructor($cherry) {
    super($cherry);
    this.setName('paste', 'paste');
    this.$currentMenuOptions = {
      name: 'paste',
      icon: /** @type {import('~types/menus').CustomMenuIcon} */ ({ type: 'svg', content: CLIPBOARD_SVG }),
    };
    this.updateMarkdown = false;
    this.subMenuConfig = [
      {
        iconName: 'create',
        name: 'pasteDefault',
        onclick: () => this.$smartPaste(),
      },
      {
        iconName: 'normal',
        name: 'pastePlain',
        onclick: () => this.$pastePlain(),
      },
      {
        iconName: 'code',
        name: 'pasteMarkdown',
        onclick: () => this.$pasteAsMarkdown(),
      },
    ];
  }

  onClick() {
    this.$smartPaste();
  }

  /**
   * 在当前活动编辑器中插入文本（兼容 CodeMirror 和 WYSIWYG）
   */
  $insertText(text) {
    if (!text) return;
    this.$focusEditor();
    if (this.$cherry.status?.wysiwyg === 'show') {
      document.execCommand('insertText', false, text);
      return;
    }
    const cm = this.$cherry.editor?.editor;
    if (cm) {
      cm.replaceSelection(text);
    }
  }

  $smartPaste() {
    if (!navigator.clipboard || !navigator.clipboard.read) {
      this.$fallbackPaste();
      return;
    }
    navigator.clipboard
      .read()
      .then((items) => {
        let htmlContent = '';
        let textContent = '';
        const promises = [];
        for (const item of items) {
          if (item.types.includes('text/html')) {
            promises.push(
              item
                .getType('text/html')
                .then((blob) => blob.text())
                .then((html) => {
                  htmlContent = html;
                }),
            );
          }
          if (item.types.includes('text/plain')) {
            promises.push(
              item
                .getType('text/plain')
                .then((blob) => blob.text())
                .then((text) => {
                  textContent = text;
                }),
            );
          }
        }
        Promise.all(promises).then(() => {
          if (htmlContent) {
            const md = this.$html2md(htmlContent);
            if (md && md.trim()) {
              this.$insertText(md);
              return;
            }
          }
          this.$insertText(textContent);
        });
      })
      .catch(() => {
        this.$pastePlain();
      });
  }

  $pastePlain() {
    if (navigator.clipboard && navigator.clipboard.readText) {
      navigator.clipboard
        .readText()
        .then((text) => {
          this.$insertText(text);
        })
        .catch(() => {
          this.$fallbackPaste();
        });
    } else {
      this.$fallbackPaste();
    }
  }

  $pasteAsMarkdown() {
    if (!navigator.clipboard || !navigator.clipboard.read) {
      this.$pastePlain();
      return;
    }
    navigator.clipboard
      .read()
      .then((items) => {
        for (const item of items) {
          if (item.types.includes('text/html')) {
            item
              .getType('text/html')
              .then((blob) => blob.text())
              .then((html) => {
                const md = this.$html2md(html);
                if (md && md.trim()) {
                  this.$insertText(md);
                }
              });
            return;
          }
        }
        this.$pastePlain();
      })
      .catch(() => {
        this.$pastePlain();
      });
  }

  $html2md(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    return htmlParser.run(div.innerHTML);
  }

  $focusEditor() {
    if (this.$cherry.status?.wysiwyg === 'show') {
      const el =
        this.$cherry.wrapperDom.querySelector('.milkdown [contenteditable]') ||
        this.$cherry.wrapperDom.querySelector('[contenteditable]');
      if (el instanceof HTMLElement) el.focus();
    } else {
      const cm = this.$cherry.editor?.editor;
      if (cm) cm.focus();
    }
  }

  $fallbackPaste() {
    this.$focusEditor();
    document.execCommand('paste');
  }
}
