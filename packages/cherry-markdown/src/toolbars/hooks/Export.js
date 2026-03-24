/**
 * Copyright (C) 2021 Tencent.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import MenuBase from '@/toolbars/MenuBase';

export default class Export extends MenuBase {
  constructor($cherry) {
    super($cherry);
    this.setName('export', 'export');
    this.noIcon = false;
    this.updateMarkdown = false;
    this.ribbonFlatten = true;

    this.subMenuConfig = [
      { iconName: 'pdf', name: 'exportToPdf', onclick: this.bindSubClick.bind(this, 'pdf') },
    ];

    this.subMenuConfig.push(
      { iconName: 'image', name: 'exportScreenshot', onclick: this.bindSubClick.bind(this, 'screenShot') },
      { iconName: 'download', name: 'exportMarkdownFile', onclick: this.bindSubClick.bind(this, 'markdown') },
      { iconName: 'code', name: 'exportHTMLFile', onclick: this.bindSubClick.bind(this, 'html') },
      { iconName: 'word', name: 'exportWordFile', onclick: this.bindSubClick.bind(this, 'word') },
    );
  }

  async onClick(shortKey = '', type) {
    if (document.querySelector('.cherry-dropdown[name=export]')) {
      /** @type {HTMLElement}*/ (document.querySelector('.cherry-dropdown[name=export]')).style.display = 'none';
    }
    // 强制刷新一下预览区域的内容
    const { previewer } = this.$cherry;
    let html = '';
    if (this.$cherry.status?.wysiwyg === 'show' && this.$cherry.wysiwygEditor) {
      // WYSIWYG 模式：从 Milkdown 获取内容并通过 engine 渲染
      const markdown = this.$cherry.wysiwygEditor.getValue();
      html = this.$cherry.engine.makeHtml(markdown);
    } else if (previewer.isPreviewerHidden()) {
      html = previewer.options.previewerCache.html;
    } else {
      html = previewer.getDomContainer().innerHTML;
    }
    // 需要未加载的图片替换成原始图片
    html = previewer.lazyLoadImg.changeDataSrc2Src(html);
    previewer.refresh(html);
    await previewer.export(type);
    // 导出完成后，发送导出完成的信号
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      const ev = new CustomEvent('cherry:export:done', { detail: { type } });
      window.dispatchEvent(ev);
    }
  }
}
