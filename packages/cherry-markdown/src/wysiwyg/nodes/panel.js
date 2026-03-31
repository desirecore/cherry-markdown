/**
 * Milkdown node plugin for Cherry panel syntax:
 *   :::type [title]
 *   content
 *   :::
 *
 * Types: primary, info, warning, danger, success
 * Renders as a styled container div in the WYSIWYG editor.
 */
import { $nodeSchema, $command, $remark } from '@milkdown/kit/utils';
import { wrapIn } from 'prosemirror-commands';
import { transformCherryBlocks, getNodeText } from './utils';

const NODE_NAME = 'cherry_panel';
const MDAST_TYPE = 'cherryPanel';

const ALIGN_TYPES = new Set(['left', 'center', 'right', 'justify', 'l', 'c', 'r', 'j']);
const ALIGN_SHORT_MAP = { l: 'left', c: 'center', r: 'right', j: 'justify' };
function isAlignType(type) { return ALIGN_TYPES.has(type); }
function normalizeAlignType(type) { return ALIGN_SHORT_MAP[type] || type; }

// Match opening line: :::type [title]
const START_PATTERN = /^:::(\w+)\s*(.*)?$/;
// Match closing line: :::
const END_PATTERN = /^:::\s*$/;

function remarkCherryPanel() {
  const data = this.data();
  const toMarkdownExtensions = data.toMarkdownExtensions || (data.toMarkdownExtensions = []);
  toMarkdownExtensions.push({
    handlers: {
      [MDAST_TYPE](node, _, state, info) {
        const exit = state.enter(MDAST_TYPE);
        const tracker = state.createTracker(info);
        const titlePart = node.title ? ` ${node.title}` : '';
        let value = tracker.move(`:::${node.panelType}${titlePart}\n`);
        value += state.containerFlow(node, {
          ...tracker.current(),
          before: value,
          after: ':::',
        });
        value += tracker.move('\n:::');
        exit();
        return value;
      },
    },
  });

  return (tree) => {
    transformCherryBlocks(
      tree,
      // startTest: check if paragraph text starts with :::type
      (node) => {
        if (node.type !== 'paragraph') return null;
        const text = getNodeText(node).trim();
        const match = text.match(START_PATTERN);
        if (!match) return null;
        return { panelType: match[1], title: (match[2] || '').trim() };
      },
      // endTest: check if paragraph text is exactly :::
      (node) => {
        if (node.type !== 'paragraph') return false;
        const text = getNodeText(node).trim();
        return END_PATTERN.test(text);
      },
      // createNode
      (attrs, children) => ({
        type: MDAST_TYPE,
        panelType: attrs.panelType,
        title: attrs.title,
        children: children.length > 0 ? children : [{ type: 'paragraph', children: [{ type: 'text', value: '' }] }],
      }),
    );
  };
}

export const remarkPanelPlugin = $remark('remarkCherryPanel', () => remarkCherryPanel);

export const panelSchema = $nodeSchema(NODE_NAME, () => ({
  content: 'block+',
  group: 'block',
  attrs: {
    panelType: { default: 'primary' },
    title: { default: '' },
  },
  defining: true,
  parseDOM: [
    {
      tag: 'div.cherry-text-align',
      getAttrs: (dom) => ({
        panelType: dom.dataset.panelType || 'center',
        title: '',
      }),
    },
    {
      tag: 'div.cherry-panel',
      getAttrs: (dom) => ({
        panelType: dom.dataset.panelType || 'primary',
        title: dom.querySelector('.cherry-panel--title')?.textContent || '',
      }),
      contentElement: '.cherry-panel--body',
    },
  ],
  toDOM: (node) => {
    const { panelType, title } = node.attrs;
    if (isAlignType(panelType)) {
      const align = normalizeAlignType(panelType);
      return [
        'div',
        {
          class: `cherry-text-align cherry-text-align__${align}`,
          style: `text-align:${align};`,
          'data-panel-type': panelType,
        },
        0,
      ];
    }
    return [
      'div',
      {
        class: `cherry-panel cherry-panel__${panelType}`,
        'data-panel-type': panelType,
      },
      ['div', { class: 'cherry-panel--title', contenteditable: 'false' }, title || ''],
      ['div', { class: 'cherry-panel--body' }, 0],
    ];
  },
  parseMarkdown: {
    match: (node) => node.type === MDAST_TYPE,
    runner: (state, node, type) => {
      state.openNode(type, { panelType: node.panelType, title: node.title || '' });
      state.next(node.children);
      state.closeNode();
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === NODE_NAME,
    runner: (state, node) => {
      state.openNode(MDAST_TYPE, undefined, {
        panelType: node.attrs.panelType,
        title: node.attrs.title,
      });
      state.next(node.content);
      state.closeNode();
    },
  },
}));

export const insertPanelCommand = $command('InsertPanel', (ctx) => (panelType = 'primary') =>
  (state, dispatch, view) => {
    const nodeType = state.schema.nodes[NODE_NAME];
    if (!nodeType) return false;

    const attrs = { panelType, title: '' };

    // Use prosemirror wrapIn — robust, handles edge cases, preserves content
    if (wrapIn(nodeType, attrs)(state, dispatch, view)) return true;

    // Fallback: replace current block with a panel containing its content
    if (dispatch) {
      const { $from } = state.selection;
      if ($from.depth < 1) return false;
      const parent = $from.parent;
      const content = parent.content.size > 0
        ? parent.type.create(parent.attrs, parent.content)
        : state.schema.nodes.paragraph.create();
      const panelNode = nodeType.create(attrs, content);
      const from = $from.before($from.depth);
      const to = $from.after($from.depth);
      dispatch(state.tr.replaceWith(from, to, panelNode));
    }
    return true;
  },
);

export const panel = [remarkPanelPlugin, panelSchema, insertPanelCommand].flat();
