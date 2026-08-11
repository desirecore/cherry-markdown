// Heavy modules are loaded on demand to reduce initial bundle size
// MathJax and html-to-image are dynamically imported when needed
import { shouldPreserveLocalEdit } from './editor-state';

// import md5 from 'md5';

const webviewLabels = {
  en: {
    edit: 'Edit',
    fontStyle: 'Font style',
    save: 'Save',
    savePng: 'Save as PNG',
    editDisabled: 'The Markdown document is not active, so preview editing is disabled.',
  },
  'zh-cn': {
    edit: '编辑',
    fontStyle: '字体样式',
    save: '保存',
    savePng: '保存为 PNG',
    editDisabled: '当前 Markdown 文档未激活，不能保存预览中的编辑。',
  },
  ru: {
    edit: 'Изменить',
    fontStyle: 'Стиль шрифта',
    save: 'Сохранить',
    savePng: 'Сохранить как PNG',
    editDisabled: 'Документ Markdown неактивен, поэтому редактирование предпросмотра отключено.',
  },
}[document.documentElement.lang.toLowerCase()] || {
  edit: 'Edit',
  fontStyle: 'Font style',
  save: 'Save',
  savePng: 'Save as PNG',
  editDisabled: 'The Markdown document is not active, so preview editing is disabled.',
};

/**
 * 在侧边栏增加编辑/预览入口
 */
// eslint-disable-next-line no-undef
const customMenuChangeModule = Cherry.createMenuHook(webviewLabels.edit, {
  iconName: 'pen',
  onClick(selection) {
    if (window.isDisableEdit) {
      vscode.postMessage({
        type: 'show-message',
        data: webviewLabels.editDisabled,
      });
      return selection;
    }
    const pen = document.getElementsByClassName('cherry-toolbar-pen')[0];
    const markdown = document.getElementById('markdown');
    const isPreviewOnly = !/active/.test(pen.className);
    if (isPreviewOnly) {
      markdown.className = 'markdown-edit-preview';
      pen.className = `${pen.className} active`;
      pen.innerHTML = '<i class="ch-icon ch-icon-pen-fill"></i>';
    } else {
      markdown.className = 'markdown-preview-only';
      pen.className = pen.className.replace(' active', '');
      pen.innerHTML = '<i class="ch-icon ch-icon-pen"></i>';
    }
    return selection;
  },
});

// eslint-disable-next-line no-undef
const customMenuFont = Cherry.createMenuHook(webviewLabels.fontStyle, {
  iconName: 'font',
});

// eslint-disable-next-line no-undef
const customMenuExport = Cherry.createMenuHook(webviewLabels.save, {
  iconName: 'export',
  subMenuConfig: [
    {
      noIcon: true,
      name: webviewLabels.savePng,
      onclick: async () => {
        const cherrymarkdown = document.querySelector('.cherry-previewer');
        if (!cherrymarkdown) {
          vscode.postMessage({ type: 'export-png', data: 'export-fail' });
          return;
        }
        try {
          const mod = await import(/* webpackChunkName: "html-to-image" */ 'html-to-image');
          const toPng = mod.toPng || (mod.default && mod.default.toPng);
          if (!toPng) throw new Error('html-to-image unavailable');
          const dataUrl = await toPng(cherrymarkdown);
          vscode.postMessage({ type: 'export-png', data: dataUrl });
        } catch (error) {
          console.error('toPng error:', error);
          vscode.postMessage({ type: 'export-png', data: 'export-fail' });
        }
      },
    },
  ],
});

// eslint-disable-next-line no-undef
// const customMenuPublish = Cherry.createMenuHook('发布',  {
//   iconName: 'publish',
//   onClick: (selection, type) => {
//     publish(type);
//   },
//   subMenuConfig: [
//     { noIcon: true, name: '发布到Iwiki', onclick: () => {
//       cherry.toolbar.menus.hooks.customMenuChangeTheme.fire(null, 'iwiki');
//     } },
//     { noIcon: true, name: '发布到KM', onclick: () => {
//       cherry.toolbar.menus.hooks.customMenuChangeTheme.fire(null, 'km');
//     } },
//     { noIcon: true, name: '发布到简书', onclick: () => {
//       cherry.toolbar.menus.hooks.customMenuChangeTheme.fire(null, 'jianshu');
//     } },
//   ],
// });

/** 处理 a 链接跳转问题 */
const onClickLink = (e, target) => {
  // 这里不能直接使用 target.href，因为本地相对文件地址会被vscode转成`webview://`协议
  const href = target.attributes?.href.value;

  const hrefValidation = href ? href : 'href-invalid';
  if (isHttpUrl(hrefValidation) || hrefValidation) {
    // 阻止a链接在webview的默认跳转行为
    e.preventDefault();
    vscode.postMessage({
      type: 'open-url',
      data: href,
    });
    return;
  }
  vscode.postMessage({
    type: 'open-url',
    data: 'href-invalid',
  });
};

const basicConfig = {
  id: 'markdown',
  externals: {
    echarts: window.echarts,
    MathJax: window.MathJax,
  },
  isPreviewOnly: false,
  engine: {
    global: {
      // eslint-disable-next-line no-unused-vars
      urlProcessor(url, srcType) {
        // console.log('url-processor', url, srcType);
        // if (srcType === 'image') {
        //   loadOneImg({ src: url });
        // }
        return url;
      },
    },
    syntax: {
      codeBlock: {
        theme: 'twilight',
        mermaid: {
          svg2img: false, // 是否将mermaid生成的画图变成img格式
        },
      },
      table: {
        enableChart: false,
        // chartEngine: Engine Class
      },
      fontEmphasis: {
        allowWhitespace: false, // 是否允许首尾空格
      },
      strikethrough: {
        needWhitespace: false, // 是否必须有前后空格
      },
      mathBlock: {
        engine: 'MathJax', // katex或MathJax
      },
      inlineMath: {
        engine: 'MathJax', // katex或MathJax
      },
      emoji: {
        useUnicode: true,
      },
      header: {
        anchorStyle: 'none',
      },
    },
  },
  toolbars: {
    toolbar: [
      'bold',
      {
        customMenuFont: ['italic', 'strikethrough', 'underline', 'sub', 'sup', 'ruby'],
      },
      'size',
      'color',
      '|',
      'header',
      'list',
      '|',
      'panel',
      'justify',
      'detail',
      '|',
      {
        insert: [
          'image',
          // 'audio',
          // 'video',
          'link',
          'hr',
          'br',
          'code',
          'formula',
          'toc',
          'table',
          // 'pdf',
          // 'word',
        ],
      },
      // 'graph',
      'togglePreview',
    ],
    bubble: ['bold', 'italic', 'underline', 'strikethrough', 'sub', 'sup', 'quote', 'ruby', '|', 'size', 'color'], // array or false
    sidebar: ['customMenuChangeModule', 'mobilePreview', 'copy', 'theme', 'customMenuExport'],
    customMenu: {
      customMenuChangeModule,
      customMenuFont,
      customMenuExport,
    },
    toc: true,
  },
  event: {
    // 当编辑区内容有实际变化时触发
    changeMainTheme: (theme) => {
      vscode.postMessage({
        type: 'change-theme',
        data: theme,
      });
    },
  },
  previewer: {
    // 自定义markdown预览区域class
    // className: 'markdown'
    lazyLoadImg: {
      // afterLoadOneImgCallback: loadOneImg,
    },
  },
  keydown: [],
  // extensions: [],
  callback: {
    // eslint-disable-next-line no-undef
    changeString2Pinyin: pinyin,
    beforeImageMounted(srcProp, srcValue) {
      //  http路径 或 data路径
      if (isHttpUrl(srcValue) || isDataUrl(srcValue)) {
        return {
          src: srcValue,
        };
      }
      // TODO: 绝对路径(如windows上D:\GithubDesktop\cherry-markdown\README.md)

      // 相对路径
      try {
        return { src: resourceUri ? new URL(srcValue, resourceUri).href : srcValue };
      } catch {
        return { src: srcValue };
      }
    },
    onClickPreview: (e) => {
      const { target } = e;
      switch (target?.nodeName) {
        case 'SPAN':
          if (target?.parentElement?.nodeName === 'A') {
            onClickLink(e, target?.parentElement);
          }
          break;
        case 'A':
          onClickLink(e, target);
          break;
      }
    },
  },
};

function isDataUrl(url) {
  return /^data:/.test(url);
}

function isHttpUrl(url) {
  return /https?:\/\//.test(url);
}

/**
 * [vscode language](https://code.visualstudio.com/docs/getstarted/locales#_available-locales);
 * [cherry language](https://github.com/Tencent/cherry-markdown/wiki/%E5%A4%9A%E8%AF%AD%E8%A8%80);
 * */
const languageIdentifiers = {
  en: 'en_US', // English (US)
  'zh-cn': 'zh_CN', // Simplified Chinese
  // 'zh-tw': '繁体中文', // Traditional Chinese
  // fr: '法语', // French
  // de: '德语', // German
  // it: '意大利语', // Italian
  // es: '西班牙语', // Spanish
  // ja: '日语', // Japanese
  // ko: '韩国人', // Korean
  ru: 'ru_RU', // Russian
  // 'pt-br': '葡萄牙语（巴西）', // Portuguese (Brazil)
  // tr: '土耳其', // Turkish
  // pl: '波兰', // Polish
  // cs: '捷克语', // Czech
  // hu: '匈牙利', // Hungarian
};

// The document is deliberately not embedded in HTML. It is received after the ready handshake.
const mdInfo = { text: '' };
const locale = languageIdentifiers[document.documentElement.lang.toLowerCase()] || 'zh_CN';
// eslint-disable-next-line no-undef
const vscode = acquireVsCodeApi();
let editorState;
let resourceUri = '';
let editRequestId = 0;
let editInFlight;
let pendingMarkdown;
let editDebounceTimer;
let suppressEditMessage = false;
const uploadCallbacks = new Map();

basicConfig.callback.fileUpload = (file, callback) => {
  if (!editorState) return;
  const requestId = ++editRequestId;
  uploadCallbacks.set(requestId, { callback, documentUri: editorState.documentUri });
  vscode.postMessage({
    type: 'upload-file',
    data: {
      requestId,
      documentUri: editorState.documentUri,
    },
  });
};

const config = Object.assign({}, basicConfig, { value: mdInfo.text, locale });
// 异步加载 MathJax（如果需要），以便拆分包体积但不阻塞初始化
import(/* webpackChunkName: "mathjax" */ 'mathjax/es5/tex-svg.js').catch(() => {});
// eslint-disable-next-line new-cap, no-undef
const cherry = new Cherry(config);
// 图片缓存
// const imgCache = {};

// function afterInit() {
//   setTimeout(() => {
//     const imgs = cherry.previewer.getDom().querySelectorAll('img');
//     imgs.forEach((img) => {
//       loadOneImg(img);
//     });
//   }, 100);
// }

// function loadOneImg(img) {
//   const { src } = img;
//   const sign = md5(src);
//   if (typeof imgCache[sign] !== 'undefined') {
//     return true;
//   }
//   imgCache[sign] = true;
//   vscode.postMessage({
//     type: 'cherry-load-img',
//     data: src,
//   });
// }

// 预览区域滚动的时候发送事件
cherry.previewer.getDom().addEventListener('scroll', () => {
  const domContainer = cherry.previewer.getDom();
  if (window.disableScrollListener) {
    return true;
  }
  if (domContainer.scrollTop <= 0) {
    postScrollMessage(0);
    return true;
  }
  if (domContainer.scrollTop + domContainer.offsetHeight > domContainer.scrollHeight) {
    postScrollMessage(-1);
    return true;
  }
  // 获取预览容器基准坐标
  const basePoint = domContainer.getBoundingClientRect();
  // 观察点坐标，取容器中轴线
  const watchPoint = {
    x: basePoint.left + basePoint.width / 2,
    y: basePoint.top + 1,
  };
  // 获取观察点处的DOM
  const targetElements = elementsFromPoint(watchPoint.x, watchPoint.y);
  let targetElement;
  for (let i = 0; i < targetElements.length; i++) {
    if (domContainer.contains(targetElements[i])) {
      targetElement = targetElements[i];
      break;
    }
  }
  if (!targetElement || targetElement === domContainer) {
    return;
  }
  // 获取观察点处最近的markdown元素
  let mdElement = targetElement.closest('[data-sign]');
  // 由于新增脚注，内部容器也有可能存在data-sign，所以需要循环往父级找
  while (mdElement && mdElement.parentElement && mdElement.parentElement !== domContainer) {
    mdElement = mdElement.parentElement.closest('[data-sign]');
  }
  if (!mdElement) {
    return;
  }
  // 计算当前焦点容器的所在行数
  let lines = 0;
  let element = mdElement;
  while (element) {
    lines += +element.getAttribute('data-lines');
    element = element.previousElementSibling; // 取上一个兄弟节点，直到为null
  }
  // markdown元素存在margin，getBoundingRect不能获取到margin
  const mdElementStyle = getComputedStyle(mdElement);
  const marginTop = parseFloat(mdElementStyle.marginTop);
  const marginBottom = parseFloat(mdElementStyle.marginBottom);
  // markdown元素基于当前页面的矩形模型
  const mdRect = mdElement.getBoundingClientRect();
  const mdActualHeight = mdRect.height + marginTop + marginBottom;
  // (mdRect.y - marginTop)为顶部触达区域，basePoint.y为预览区域的顶部，故可视范围应减去预览区域的偏移
  const mdOffsetTop = mdRect.y - marginTop - basePoint.y;
  const lineNum = +mdElement.getAttribute('data-lines'); // 当前markdown元素所占行数
  const percent = Math.abs(mdOffsetTop) / mdActualHeight;
  postScrollMessage(lines - lineNum + parseInt(lineNum * percent, 10));
});

function postScrollMessage(line) {
  vscode.postMessage({
    type: 'preview-scroll',
    data: line,
  });
}

cherry.onChange((newValue) => {
  if (window.disableEditListener || suppressEditMessage || !editorState) return true;
  const markdown = typeof newValue === 'string' ? newValue : newValue?.markdown;
  if (typeof markdown !== 'string') return true;
  pendingMarkdown = markdown;
  scheduleEdit();
  return true;
});

function scheduleEdit() {
  if (editInFlight || !editorState) return;
  if (editDebounceTimer) clearTimeout(editDebounceTimer);
  editDebounceTimer = setTimeout(() => {
    editDebounceTimer = undefined;
    if (editInFlight || !editorState || typeof pendingMarkdown !== 'string') return;
    const markdown = pendingMarkdown;
    pendingMarkdown = undefined;
    const requestId = ++editRequestId;
    editInFlight = { requestId, markdown };
    vscode.postMessage({
      type: 'editor-change',
      data: {
        documentUri: editorState.documentUri,
        baseVersion: editorState.documentVersion,
        requestId,
        markdown,
      },
    });
  }, 120);
}

let scrollTimeOut;
window.addEventListener('message', (e) => {
  const { cmd, data } = e.data || {};
  switch (cmd) {
    case 'editor-init':
    case 'editor-change':
      if (!data || typeof data.text !== 'string' || typeof data.documentUri !== 'string') break;
      const preserveLocalEdit = shouldPreserveLocalEdit(editorState, data, editInFlight, pendingMarkdown);
      editorState = data;
      resourceUri = data.resourceUri || '';
      for (const [requestId, pending] of uploadCallbacks) {
        if (pending.documentUri !== editorState.documentUri) uploadCallbacks.delete(requestId);
      }
      if (!preserveLocalEdit) {
        editInFlight = undefined;
        pendingMarkdown = undefined;
        if (editDebounceTimer) clearTimeout(editDebounceTimer);
        suppressEditMessage = true;
        window.disableEditListener = true;
        cherry.setValue(data.text);
      }
      if (typeof cherry.setTheme === 'function' && data.theme) cherry.setTheme(data.theme);
      if (!preserveLocalEdit) {
        setTimeout(() => {
          window.disableEditListener = false;
          suppressEditMessage = false;
        }, 0);
      }
      break;
    case 'editor-ack':
      if (!editorState || !editInFlight || data?.requestId !== editInFlight.requestId) break;
      editorState = { ...editorState, documentVersion: data.documentVersion, text: data.text };
      editInFlight = undefined;
      scheduleEdit();
      break;
    case 'editor-scroll':
      window.disableScrollListener = true;
      cherry.previewer.scrollToLineNumWithOffset(data, 0);
      scrollTimeOut && clearTimeout(scrollTimeOut);
      scrollTimeOut = setTimeout(() => {
        window.disableScrollListener = false;
      }, 500);
      break;
    case 'disable-edit':
      // 强制进入预览模式
      window.isDisableEdit = true;
      // eslint-disable-next-line no-case-declarations
      const pen = document.getElementsByClassName('cherry-toolbar-pen')[0];
      // eslint-disable-next-line no-case-declarations
      const markdown = document.getElementById('markdown');
      if (markdown) markdown.className = 'markdown-preview-only';
      if (pen) {
        pen.className = pen.className.replace(' active', '');
        pen.innerHTML = '<i class="ch-icon ch-icon-pen"></i>';
      }
      break;
    case 'enable-edit':
      window.isDisableEdit = false;
      break;
    case 'upload-file-result': {
      if (
        !data ||
        typeof data.requestId !== 'number' ||
        typeof data.url !== 'string' ||
        !editorState ||
        data.documentUri !== editorState.documentUri
      )
        break;
      const pending = uploadCallbacks.get(data.requestId);
      uploadCallbacks.delete(data.requestId);
      const { url, requestId, ...rest } = data;
      if (pending?.documentUri === editorState.documentUri && typeof pending.callback === 'function')
        pending.callback(url, rest);
      // 根据回填参数应用图片样式（isNotBorder / isBorder / isShadow / isRadius）
      try {
        const previewDom = cherry.previewer.getDom();
        const imgs = [...previewDom.querySelectorAll('img')].filter((img) => img.getAttribute('src') === url);
        imgs.forEach((img) => {
          // 清理之前的样式类
          img.classList.remove('ch-image-border', 'ch-image-no-border', 'ch-image-shadow', 'ch-image-radius');
          if (rest.isNotBorder) {
            img.classList.add('ch-image-no-border');
          } else if (rest.isBorder) {
            img.classList.add('ch-image-border');
          }
          if (rest.isShadow) {
            img.classList.add('ch-image-shadow');
          }
          if (rest.isRadius) {
            img.classList.add('ch-image-radius');
          }
        });
      } catch (e) {
        // 忽略前端样式应用中的错误
      }
      break;
    }
    case 'operation-error':
      if (data?.operation === 'editor-change' && editInFlight && data.requestId === editInFlight.requestId) {
        editInFlight = undefined;
        scheduleEdit();
      }
      if (typeof data?.message === 'string') {
        const status = document.getElementById('webview-status');
        if (status) status.textContent = data.message;
      }
      if (data?.operation === 'upload-file' && typeof data.requestId === 'number')
        uploadCallbacks.delete(data.requestId);
      break;
  }
});

vscode.postMessage({ type: 'ready' });

/**
 * document.elementsFromPoint polyfill
 * ref: https://github.com/JSmith01/elementsfrompoint-polyfill/blob/master/index.js
 * @param {number} x
 * @param {number} y
 */
function elementsFromPoint(x, y) {
  // see https://caniuse.com/#search=elementsFromPoint
  if (typeof document.elementsFromPoint === 'function') {
    return document.elementsFromPoint(x, y);
  }

  if (typeof (/** @type {any}*/ (document).msElementsFromPoint) === 'function') {
    const nodeList = /** @type {any}*/ (document).msElementsFromPoint(x, y);
    return nodeList !== null ? Array.from(nodeList) : nodeList;
  }
  const elements = [];
  const pointerEvents = [];
  /** @type {HTMLElement} */
  let ele;
  do {
    const currentElement = /** @type {HTMLElement} */ (document.elementFromPoint(x, y));
    if (ele !== currentElement) {
      ele = currentElement;
      elements.push(ele);
      pointerEvents.push(ele.style.pointerEvents);
      ele.style.pointerEvents = 'none';
    } else {
      ele = null;
    }
  } while (ele);
  elements.forEach((e, index) => {
    e.style.pointerEvents = pointerEvents[index];
  });
  return elements;
}
