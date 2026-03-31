/**
 * Milkdown 命令映射表
 * 将 Cherry 工具栏按钮名映射到 Milkdown ProseMirror 命令
 *
 * 使用纯字符串 key 调用 Milkdown 命令，避免直接导入 @milkdown/* 子包。
 * 这样消费方项目的 Vite 预构建不会因为重新打包产生新的 Symbol，
 * 导致 ctx.get(commandsCtx) 身份不匹配问题。
 */
import { undo, redo } from 'prosemirror-history';

/**
 * 从 Header 按钮的 shortKey 中解析标题级别
 */
function parseHeadingLevel(shortKey) {
  const level = parseInt(shortKey, 10);
  return level >= 1 && level <= 6 ? level : 1;
}

/**
 * 创建 WYSIWYG 命令映射表
 * @returns {object} commandMap 对象
 */
export function createWysiwygCommandMap() {
  return {
    commands: {
      // 行内格式化 — 使用字符串 key
      bold: { key: 'ToggleStrong' },
      italic: { key: 'ToggleEmphasis' },
      strikethrough: { key: 'ToggleStrikeThrough' },
      inlineCode: { key: 'ToggleInlineCode' },
      link: { key: 'ToggleLink', payload: { href: '' } },
      sup: { key: 'ToggleSuperscript' },
      sub: { key: 'ToggleSubscript' },
      underline: { key: 'ToggleUnderline' },
      highlight: { key: 'ToggleHighlight' },

      // 标题
      header: { key: 'WrapInHeading', payload: (shortKey) => parseHeadingLevel(shortKey) },
      h1: { key: 'WrapInHeading', payload: 1 },
      h2: { key: 'WrapInHeading', payload: 2 },
      h3: { key: 'WrapInHeading', payload: 3 },

      // 列表
      ul: { key: 'WrapInBulletList' },
      ol: { key: 'WrapInOrderedList' },
      list: { key: 'WrapInBulletList' },

      // 块级元素
      quote: { key: 'WrapInBlockquote' },
      code: { key: 'CreateCodeBlock' },
      hr: { key: 'InsertHr' },
      br: { key: 'InsertHardbreak' },
      table: { key: 'InsertTable' },
    },
    // 需要 Milkdown ctx 的复杂命令（接收 ctx 和 shortKey 参数）
    ctxCommands: {
      // "插入"下拉菜单：根据 shortKey 路由到对应命令
      insert: (ctx, shortKey) => {
        const commands = ctx.get('commands');
        switch (shortKey) {
          case 'hr':
            return commands.call('InsertHr');
          case 'br':
            return commands.call('InsertHardbreak');
          case 'code':
            return commands.call('CreateCodeBlock');
          case 'link':
            return commands.call('ToggleLink', { href: '' });
          default:
            // table/image/formula/checklist 等需要特殊 UI 交互，返回 false
            return false;
        }
      },
      // 颜色按钮：从 shortKey 中解析颜色类型和值
      color: (ctx, shortKey) => {
        if (!shortKey || !/(color|background-color)\s*:/.test(shortKey)) return false;
        const commands = ctx.get('commands');
        const isBg = /background-color\s*:/.test(shortKey);
        const color = shortKey.replace(/(color|background-color)\s*:\s*([#0-9a-zA-Z]+).*$/, '$2').trim();
        if (isBg) {
          return commands.call('ToggleBgColor', color);
        }
        return commands.call('ToggleFontColor', color);
      },
      // 字号按钮：从 shortKey 中解析字号值
      size: (ctx, shortKey) => {
        if (!shortKey || !/^[0-9]+$/.test(shortKey)) return false;
        const commands = ctx.get('commands');
        return commands.call('ToggleFontSize', shortKey);
      },
      // 注音按钮：插入 ruby inline node
      ruby: (ctx, shortKey) => {
        const commands = ctx.get('commands');
        const view = ctx.get('editorView');
        const { state } = view;
        const { from, to } = state.selection;
        const selectedText = state.doc.textBetween(from, to) || '拼音';
        const annotation = shortKey || 'pīn yīn';
        return commands.call('InsertRuby', { text: selectedText, annotation });
      },
      // 面板按钮：包裹选中内容为 panel 节点
      panel: (ctx, shortKey) => {
        const commands = ctx.get('commands');
        return commands.call('InsertPanel', shortKey || 'primary');
      },
      // 手风琴按钮：包裹选中内容为 detail 节点
      detail: (ctx, shortKey) => {
        const commands = ctx.get('commands');
        return commands.call('InsertDetail', shortKey || '');
      },
      // 脚注按钮：在光标处插入引用 + 文档末尾插入定义
      footnote: (ctx, shortKey) => {
        const commands = ctx.get('commands');
        return commands.call('InsertFootnote', { label: shortKey || '' });
      },
      // 目录按钮：插入 [[toc]] 块
      toc: (ctx) => {
        const commands = ctx.get('commands');
        return commands.call('InsertToc');
      },
      // 图片按钮：接收 JSON 数据插入 cherry_image 节点
      image: (ctx, shortKey) => {
        if (!shortKey) return false;
        try {
          const data = JSON.parse(shortKey);
          const commands = ctx.get('commands');
          return commands.call('InsertCherryImage', data);
        } catch (e) {
          return false;
        }
      },
      // draw.io 按钮：接收 JSON 数据插入 drawio 节点
      'draw.io': (ctx, shortKey) => {
        if (!shortKey) return false;
        try {
          const data = JSON.parse(shortKey);
          const commands = ctx.get('commands');
          return commands.call('InsertDrawio', data);
        } catch (e) {
          return false;
        }
      },
      checklist: (ctx) => {
        const commands = ctx.get('commands');
        const view = ctx.get('editorView');
        const { state, dispatch } = view;
        const { $from } = state.selection;

        // 查找当前所在的 list_item
        let listItemPos = null;
        let listItemNode = null;
        for (let d = $from.depth; d > 0; d--) {
          const node = $from.node(d);
          if (node.type.name === 'list_item') {
            listItemPos = $from.before(d);
            listItemNode = node;
            break;
          }
        }

        if (listItemNode) {
          // 已经在列表中 — toggle checked attribute
          const tr = state.tr;
          if (listItemNode.attrs.checked != null) {
            // 已经是 task list -> 转回普通列表
            tr.setNodeMarkup(listItemPos, undefined, { ...listItemNode.attrs, checked: null });
          } else {
            // 普通列表 -> 转为 task list (unchecked)
            tr.setNodeMarkup(listItemPos, undefined, { ...listItemNode.attrs, checked: false });
          }
          dispatch(tr);
          return true;
        }

        // 不在列表中 — 通过 Milkdown 命令创建带 checked 属性的任务列表
        const listItem = view.state.schema.nodes.list_item;
        commands.call('ClearTextInCurrentBlock');
        commands.call('WrapInBlockType', {
          nodeType: listItem,
          attrs: { checked: false },
        });
        return true;
      },
    },
    // undo/redo 使用 ProseMirror history 命令
    prosemirrorCommands: {
      undo: (view) => undo(view.state, view.dispatch),
      redo: (view) => redo(view.state, view.dispatch),
    },
  };
}
