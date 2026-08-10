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
 * 从光标位置向上遍历，找到最近的 list_item 及其父列表节点
 */
function findEnclosingList(state) {
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d);
    if (node.type.name === 'list_item') {
      if (d - 1 > 0) {
        const parentNode = $from.node(d - 1);
        if (parentNode.type.name === 'bullet_list' || parentNode.type.name === 'ordered_list') {
          return {
            listItemPos: $from.before(d),
            listItemNode: node,
            listPos: $from.before(d - 1),
            listNode: parentNode,
            listDepth: d - 1,
          };
        }
      }
      return null;
    }
  }
  return null;
}

/**
 * 核心工具：收集选区覆盖的 list_item
 * 所有列表操作的基础 — 根据选区范围决定影响哪些行
 */
function getListItemsInSelection(state, enclosing) {
  const { from, to } = state.selection;
  const { listPos, listNode } = enclosing;
  const items = [];
  listNode.forEach((child, offset, index) => {
    if (child.type.name === 'list_item') {
      const childStart = listPos + 1 + offset;
      const childEnd = childStart + child.nodeSize;
      if (childStart < to && childEnd > from) {
        items.push({ pos: childStart, node: child, offset, index });
      }
    }
  });
  return items;
}

/**
 * 将选中的段落包裹为列表，每个段落 → 独立 list_item
 * @param {object} state
 * @param {Function} dispatch
 * @param {string} targetListType - 'ordered_list' | 'bullet_list'
 * @param {object} [extraItemAttrs] - 额外的 list_item 属性（如 { checked: false }）
 */
function wrapBlocksInList(state, dispatch, targetListType, extraItemAttrs) {
  const { schema } = state;
  const { $from, $to } = state.selection;
  const range = $from.blockRange($to);
  if (!range) return false;

  const listType = schema.nodes[targetListType];
  const listItemType = schema.nodes.list_item;
  const paragraphType = schema.nodes.paragraph;
  if (!listType || !listItemType) return false;

  const isOrdered = targetListType === 'ordered_list';
  // 收集输出节点：标题保留原样，其余内容合并为列表
  const outputNodes = [];
  let pendingItems = [];

  const makeItemAttrs = () => ({
    listType: isOrdered ? 'ordered' : 'bullet',
    label: isOrdered ? `${pendingItems.length + 1}.` : '•',
    spread: false,
    ...extraItemAttrs,
  });

  const flushItems = () => {
    if (pendingItems.length > 0) {
      const listAttrs = isOrdered ? { order: 1, spread: false } : { spread: false };
      outputNodes.push(listType.create(listAttrs, pendingItems));
      pendingItems = [];
    }
  };

  for (let i = range.startIndex; i < range.endIndex; i++) {
    const block = range.parent.child(i);

    if (block.type.name === 'heading' && paragraphType) {
      // 标题 → 转为 paragraph（标准行为：标题变列表项会丢失标题样式）
      const para = paragraphType.create(null, block.content);
      pendingItems.push(listItemType.create(makeItemAttrs(), para));
    } else if (block.type.name === 'bullet_list' || block.type.name === 'ordered_list') {
      // 已有列表 → 展平：提取每个 list_item 的内容，重新包裹
      for (let childIndex = 0; childIndex < block.childCount; childIndex++) {
        const child = block.child(childIndex);
        if (child.type.name === 'list_item') {
          const content = [];
          for (let innerIndex = 0; innerIndex < child.childCount; innerIndex++) {
            content.push(child.child(innerIndex));
          }
          pendingItems.push(listItemType.create(makeItemAttrs(), content));
        }
      }
    } else if (block.type.name === 'paragraph') {
      pendingItems.push(listItemType.create(makeItemAttrs(), block));
    } else {
      // 其他块级节点（code_block 等）→ 空 paragraph + 原节点
      const content = paragraphType ? [paragraphType.create(), block] : [block];
      pendingItems.push(listItemType.create(makeItemAttrs(), content));
    }
  }
  flushItems();

  if (outputNodes.length === 0) return false;

  const tr = state.tr;
  tr.replaceWith(range.start, range.end, outputNodes);
  tr.scrollIntoView();
  dispatch(tr);
  return true;
}

/**
 * 取消列表：提取所有 list_item 的内容块，替换整个列表
 */
function liftEntireList(state, dispatch, enclosing) {
  const { listPos, listNode } = enclosing;
  const tr = state.tr;
  const blocks = [];
  listNode.forEach((child) => {
    if (child.type.name === 'list_item') {
      child.forEach((block) => {
        blocks.push(block);
      });
    }
  });
  if (blocks.length === 0) return false;
  tr.replaceWith(listPos, listPos + listNode.nodeSize, blocks);
  tr.scrollIntoView();
  dispatch(tr);
  return true;
}

/**
 * 转换列表类型（OL↔UL）：修改每个 list_item 的 listType/label + 父节点类型
 */
function convertListType(state, dispatch, enclosing, targetListType) {
  const { listPos, listNode } = enclosing;
  const { schema } = state;
  const targetType = schema.nodes[targetListType];
  if (!targetType) return false;

  const tr = state.tr;
  const isTargetOrdered = targetListType === 'ordered_list';

  listNode.forEach((child, offset, index) => {
    if (child.type.name === 'list_item') {
      const childPos = listPos + 1 + offset;
      tr.setNodeMarkup(childPos, undefined, {
        ...child.attrs,
        listType: isTargetOrdered ? 'ordered' : 'bullet',
        label: isTargetOrdered ? `${index + 1}.` : '•',
        checked: null, // 转换类型时去掉清单标记
      });
    }
  });

  const parentNewAttrs = {};
  const targetAttrsSpec = targetType.spec.attrs || {};
  for (const key of Object.keys(targetAttrsSpec)) {
    if (key in listNode.attrs) {
      parentNewAttrs[key] = listNode.attrs[key];
    }
  }
  tr.setNodeMarkup(listPos, targetType, parentNewAttrs);

  tr.scrollIntoView();
  dispatch(tr);
  return true;
}

/**
 * OL/UL 按钮逻辑
 */
function handleListCommand(ctx, targetListType) {
  const view = ctx.get('editorView');
  const { state, dispatch } = view;

  const enclosing = findEnclosingList(state);

  if (!enclosing) {
    // 不在列表中 → 创建新列表（每个选中段落 → 独立 list_item）
    return wrapBlocksInList(state, dispatch, targetListType);
  }

  if (enclosing.listNode.type.name === targetListType) {
    // 同类型：检查是否为清单（带 checked 属性）
    let isChecklist = false;
    enclosing.listNode.forEach((child) => {
      if (child.type.name === 'list_item' && child.attrs.checked != null) {
        isChecklist = true;
      }
    });
    if (isChecklist) {
      // 清单 → 去掉 checked，还原为普通列表
      const { listPos, listNode } = enclosing;
      const tr = state.tr;
      listNode.forEach((child, offset) => {
        if (child.type.name === 'list_item') {
          const childPos = listPos + 1 + offset;
          tr.setNodeMarkup(childPos, undefined, {
            ...child.attrs,
            checked: null,
          });
        }
      });
      tr.scrollIntoView();
      dispatch(tr);
      return true;
    }
    // 普通同类型 → 取消列表
    return liftEntireList(state, dispatch, enclosing);
  }

  // 不同类型 → 转换
  return convertListType(state, dispatch, enclosing, targetListType);
}

/**
 * Checklist 按钮逻辑
 * 选区感知：只影响选区覆盖的 list_item
 */
function handleChecklist(ctx) {
  const view = ctx.get('editorView');
  const { state, dispatch } = view;

  const enclosing = findEnclosingList(state);

  if (enclosing) {
    const items = getListItemsInSelection(state, enclosing);
    if (items.length === 0) return false;

    const hasChecked = items.some((item) => item.node.attrs.checked != null);
    const tr = state.tr;

    if (hasChecked) {
      // 已有 checked → 移除清单标记
      for (const item of items) {
        tr.setNodeMarkup(item.pos, undefined, {
          ...item.node.attrs,
          checked: null,
        });
      }
    } else if (enclosing.listNode.type.name === 'ordered_list') {
      // 有序列表 → 清单：整个列表转为 bullet_list + 所有 item 加 checked
      const { listPos, listNode } = enclosing;
      const bulletListType = state.schema.nodes.bullet_list;
      listNode.forEach((child, offset) => {
        if (child.type.name === 'list_item') {
          const childPos = listPos + 1 + offset;
          tr.setNodeMarkup(childPos, undefined, {
            ...child.attrs,
            listType: 'bullet',
            label: '•',
            checked: false,
          });
        }
      });
      if (bulletListType) {
        tr.setNodeMarkup(listPos, bulletListType, {
          spread: listNode.attrs.spread || false,
        });
      }
    } else {
      // 无序列表 → 给选中 items 加 checked
      for (const item of items) {
        tr.setNodeMarkup(item.pos, undefined, {
          ...item.node.attrs,
          checked: false,
        });
      }
    }

    tr.scrollIntoView();
    dispatch(tr);
    return true;
  }

  // 不在列表中 → 创建清单
  return wrapBlocksInList(state, dispatch, 'bullet_list', { checked: false });
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

      // 块级元素
      code: { key: 'CreateCodeBlock' },
      hr: { key: 'InsertHr' },
      br: { key: 'InsertHardbreak' },
      table: { key: 'InsertTable' },
    },
    // 需要 Milkdown ctx 的复杂命令（接收 ctx 和 shortKey 参数）
    ctxCommands: {
      // 引用按钮：在列表中时包裹整个列表
      quote: (ctx, shortKey) => {
        const view = ctx.get('editorView');
        const { state, dispatch } = view;
        const enclosing = findEnclosingList(state);
        if (enclosing) {
          const bqType = state.schema.nodes.blockquote;
          if (bqType) {
            const { listPos, listNode } = enclosing;
            const tr = state.tr;
            tr.replaceWith(listPos, listPos + listNode.nodeSize, bqType.create(null, listNode));
            tr.scrollIntoView();
            dispatch(tr);
            return true;
          }
        }
        const commands = ctx.get('commands');
        return commands.call('WrapInBlockquote');
      },
      // 列表命令：支持在不同列表类型间切换
      ol: (ctx) => handleListCommand(ctx, 'ordered_list'),
      ul: (ctx) => handleListCommand(ctx, 'bullet_list'),
      list: (ctx, shortKey) => {
        // shortKey '1'=ol, '2'=ul, '3'=checklist（来自 List.js 下拉菜单）
        if (shortKey === '1') return handleListCommand(ctx, 'ordered_list');
        if (shortKey === '2') return handleListCommand(ctx, 'bullet_list');
        if (shortKey === '3') return handleChecklist(ctx);
        return handleListCommand(ctx, 'bullet_list');
      },
      checklist: (ctx) => handleChecklist(ctx),
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
        const view = ctx.get('editorView');
        const { state, dispatch } = view;
        // 在列表中时，wrapIn 只会包裹 list_item 内的段落，需要手动包裹整个列表
        const enclosing = findEnclosingList(state);
        if (enclosing) {
          const panelNodeType = state.schema.nodes.cherry_panel;
          if (panelNodeType) {
            const { listPos, listNode } = enclosing;
            const tr = state.tr;
            tr.replaceWith(
              listPos,
              listPos + listNode.nodeSize,
              panelNodeType.create({ panelType: shortKey || 'primary', title: '' }, listNode),
            );
            tr.scrollIntoView();
            dispatch(tr);
            return true;
          }
        }
        const commands = ctx.get('commands');
        return commands.call('InsertPanel', shortKey || 'primary');
      },
      // 手风琴按钮：包裹选中内容为 detail 节点
      detail: (ctx, shortKey) => {
        const view = ctx.get('editorView');
        const { state, dispatch } = view;
        const enclosing = findEnclosingList(state);
        if (enclosing) {
          const detailNodeType = state.schema.nodes.cherry_detail;
          if (detailNodeType) {
            const { listPos, listNode } = enclosing;
            const tr = state.tr;
            tr.replaceWith(
              listPos,
              listPos + listNode.nodeSize,
              detailNodeType.create({ title: shortKey || '' }, listNode),
            );
            tr.scrollIntoView();
            dispatch(tr);
            return true;
          }
        }
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
    },
    // undo/redo 使用 ProseMirror history 命令
    prosemirrorCommands: {
      undo: (view) => undo(view.state, view.dispatch),
      redo: (view) => redo(view.state, view.dispatch),
    },
  };
}
