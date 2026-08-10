/**
 * 导出真正的 Word (.docx) 文件
 *
 * 使用消费端注入的 html-to-docx 转换函数将 HTML 转换为 DOCX。
 * html-to-docx 的 browser IIFE 格式无法被 Rollup/esbuild 正确作为模块导入，
 * 因此采用注入模式：消费端通过 Cherry 配置 fileExport.docxConverter 传入。
 *
 * 支持两种输出方式：
 *   1. 文件下载（浏览器 <a download> 或桌面端原生对话框）
 *   2. 剪贴板粘贴（保留在 exportWord.js 中的已有行为）
 */
import { preprocessHTMLForWord } from './exportWord';
import Logger from '@/Logger';

/**
 * 增强 HTML 以适配 html-to-docx 的要求
 * - 调用已有的 preprocessHTMLForWord（SVG→PNG）
 * - 将相对图片 URL 转为绝对 URL
 * - 内联关键样式
 * - 适配 Cherry 自定义元素
 * @param {string} htmlString 预览区 HTML
 * @returns {Promise<string>} 处理后的 HTML
 */
export async function enhanceHtmlForDocx(htmlString) {
  // 第一步：复用已有的 SVG→PNG 预处理（mermaid、数学公式）
  let processed = htmlString;
  try {
    processed = await preprocessHTMLForWord(htmlString);
  } catch (e) {
    Logger.warn('[exportDocx] SVG 预处理失败，使用原始 HTML:', e);
  }

  // 第二步：在临时 DOM 中做进一步适配
  const wrapper = document.createElement('div');
  wrapper.innerHTML = processed;

  // 图片：相对 URL → 绝对 URL
  resolveImageUrls(wrapper);

  // Cherry 自定义元素 → DOCX 友好的标准 HTML
  convertCherryElements(wrapper);

  // 内联关键样式（html-to-docx 仅读 inline style）
  inlineStyles(wrapper);

  return wrapper.innerHTML;
}

/**
 * 将相对图片 URL 转为绝对 URL
 */
function resolveImageUrls(container) {
  const imgs = container.querySelectorAll('img[src]');
  for (const img of imgs) {
    const src = img.getAttribute('src');
    if (src && !src.startsWith('data:') && !src.startsWith('http') && !src.startsWith('blob:')) {
      try {
        img.setAttribute('src', new URL(src, window.location.href).href);
      } catch {
        // 无法解析的 URL 保持原样
      }
    }
  }
}

/**
 * 将 Cherry 自定义 HTML 元素转换为 DOCX 友好的标准 HTML
 */
function convertCherryElements(container) {
  // Panel 容器 → 带边框的 div
  const panels = container.querySelectorAll('.cherry-panel');
  for (const panel of panels) {
    panel.style.border = '1px solid #ddd';
    panel.style.padding = '10px';
    panel.style.marginBottom = '10px';
    panel.style.borderRadius = '4px';
  }

  // Detail/折叠块 → 展开状态的 div
  const details = container.querySelectorAll('.cherry-detail, details');
  for (const detail of details) {
    if (detail.tagName === 'DETAILS') {
      detail.setAttribute('open', '');
    }
    detail.style.border = '1px solid #eee';
    detail.style.padding = '8px';
    detail.style.marginBottom = '8px';
  }

  // TOC → 简单列表（保留原有结构即可，html-to-docx 可处理 <ul>/<ol>）

  // ruby 注音 → 括号降级
  const rubies = container.querySelectorAll('ruby');
  for (const ruby of rubies) {
    const rt = ruby.querySelector('rt');
    if (rt) {
      const baseText = ruby.childNodes[0]?.textContent || '';
      const annotation = rt.textContent || '';
      const span = document.createElement('span');
      span.textContent = `${baseText}(${annotation})`;
      ruby.replaceWith(span);
    }
  }

  // 音视频标签 → 链接降级
  const mediaElements = container.querySelectorAll('audio, video');
  for (const media of mediaElements) {
    const src = media.getAttribute('src') || media.querySelector('source')?.getAttribute('src') || '';
    if (src) {
      const link = document.createElement('a');
      link.href = src;
      link.textContent = `[${media.tagName.toLowerCase()}: ${src}]`;
      media.replaceWith(link);
    }
  }
}

/**
 * 为常见 Cherry 元素内联关键 CSS 样式
 */
function inlineStyles(container) {
  // 表格
  const tables = container.querySelectorAll('table');
  for (const table of tables) {
    table.style.borderCollapse = 'collapse';
    table.style.width = '100%';
  }
  const cells = container.querySelectorAll('th, td');
  for (const cell of cells) {
    cell.style.border = '1px solid #ddd';
    cell.style.padding = '8px';
  }
  const ths = container.querySelectorAll('th');
  for (const th of ths) {
    th.style.backgroundColor = '#f2f2f2';
  }

  // 代码块
  const pres = container.querySelectorAll('pre');
  for (const pre of pres) {
    pre.style.backgroundColor = '#f4f4f4';
    pre.style.padding = '10px';
    pre.style.borderRadius = '5px';
    pre.style.fontFamily = "'Monaco', 'Consolas', monospace";
    pre.style.fontSize = '13px';
    pre.style.overflowX = 'auto';
  }

  // 行内代码
  const codes = container.querySelectorAll('code');
  for (const code of codes) {
    if (code.parentElement?.tagName !== 'PRE') {
      code.style.backgroundColor = '#f4f4f4';
      code.style.padding = '2px 4px';
      code.style.borderRadius = '3px';
      code.style.fontFamily = "'Monaco', 'Consolas', monospace";
    }
  }

  // 引用块
  const blockquotes = container.querySelectorAll('blockquote');
  for (const bq of blockquotes) {
    bq.style.borderLeft = '4px solid #ddd';
    bq.style.margin = '0';
    bq.style.paddingLeft = '16px';
    bq.style.color = '#666';
  }

  // 图片
  const imgs = container.querySelectorAll('img');
  for (const img of imgs) {
    img.style.maxWidth = '100%';
    img.style.height = 'auto';
  }
}

/**
 * 调用消费端注入的 html-to-docx 转换函数生成 DOCX Blob
 * @param {string} processedHtml 预处理后的 HTML
 * @param {Function} converter 消费端注入的 HTMLtoDOCX 函数
 * @param {object} [options]
 * @returns {Promise<Blob>}
 */
async function generateDocxBlob(processedHtml, converter, options = {}) {
  const { title = '', font = 'Arial', fontSize = '11pt' } = options;

  const fullHtml = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: ${font}; font-size: ${fontSize}; line-height: 1.6; color: #333;">
${processedHtml}
</body>
</html>`;

  const buffer = await converter(fullHtml, null, {
    title,
    margins: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
    table: { row: { cantSplit: true } },
  });

  // html-to-docx 在浏览器端返回 Blob，Node 端返回 ArrayBuffer
  if (buffer instanceof Blob) {
    return buffer;
  }
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

/**
 * 浏览器端文件下载
 */
function downloadDocxBrowser(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = `${fileName}.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 导出 DOCX 文件 — 主入口
 * @param {string} htmlText 预览区 HTML 内容
 * @param {string} fileName 文件名（不含扩展名）
 * @param {import('../Cherry').default} [cherry] Cherry 实例（用于读取 fileExport 配置）
 */
export async function exportDocxFile(htmlText, fileName, cherry) {
  // 从配置中获取消费端注入的转换函数
  const converter = cherry?.options?.fileExport?.docxConverter;
  if (typeof converter !== 'function') {
    Logger.error(
      '[exportDocx] 未配置 fileExport.docxConverter，无法导出 DOCX。' +
        ' 请在 Cherry 初始化时传入：fileExport: { docxConverter: HTMLtoDOCX }',
    );
    return;
  }

  // 兜底：WYSIWYG 模式下 Previewer 可能传入空 HTML，直接从 Cherry 实例重新获取
  let sourceHtml = htmlText;
  const stripped = htmlText?.replace(/<[^>]*>/g, '').trim();
  if (!stripped && cherry) {
    const markdown = cherry.getMarkdown();
    if (markdown) {
      sourceHtml = cherry.engine.makeHtml(markdown);
    }
  }

  let processed = sourceHtml;
  try {
    processed = await enhanceHtmlForDocx(htmlText);
  } catch (e) {
    Logger.warn('[exportDocx] 预处理失败，降级为原始 HTML:', e);
  }

  const blob = await generateDocxBlob(processed, converter, { title: fileName });

  // 尝试使用消费端提供的原生保存回调（Electron/Tauri）
  const saveAsFile = cherry?.options?.fileExport?.saveAsFile;
  if (typeof saveAsFile === 'function') {
    try {
      const saved = await saveAsFile(blob, `${fileName}.docx`);
      if (saved) return;
    } catch (e) {
      Logger.warn('[exportDocx] 自定义保存回调失败，降级为浏览器下载:', e);
    }
  }

  // 降级：浏览器文件下载
  downloadDocxBrowser(blob, fileName);
}

export default { enhanceHtmlForDocx, exportDocxFile };
