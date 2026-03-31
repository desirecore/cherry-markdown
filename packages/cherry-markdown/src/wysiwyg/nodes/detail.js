/**
 * Milkdown node plugin for Cherry detail/accordion syntax:
 *   +++ Title
 *   content
 *   +++
 *
 * Use +++- Title for default-open state.
 * Renders as <details><summary>...</summary>content</details> in the WYSIWYG editor.
 */
import { $nodeSchema, $command, $remark } from '@milkdown/kit/utils';
import { wrapIn } from 'prosemirror-commands';
import { transformCherryBlocks, getNodeText } from './utils';

const NODE_NAME = 'cherry_detail';
const MDAST_TYPE = 'cherryDetail';

let detailLocale = { detail: 'Detail' };

export function setDetailLocale(locale) {
  if (locale) detailLocale = locale;
}

function defaultTitle() {
  return detailLocale.detail || 'Detail';
}

// Match opening line: +++[-] Title
const START_PATTERN = /^\+\+\+(-?)\s+(.+)$/;
// Match closing line: +++
const END_PATTERN = /^\+\+\+\s*$/;

function remarkCherryDetail() {
  const data = this.data();
  const toMarkdownExtensions = data.toMarkdownExtensions || (data.toMarkdownExtensions = []);
  toMarkdownExtensions.push({
    handlers: {
      [MDAST_TYPE](node, _, state, info) {
        const exit = state.enter(MDAST_TYPE);
        const tracker = state.createTracker(info);
        const openMark = node.open ? '-' : '';
        let value = tracker.move(`+++${openMark} ${node.title}\n`);
        value += state.containerFlow(node, {
          ...tracker.current(),
          before: value,
          after: '+++',
        });
        value += tracker.move('\n+++');
        exit();
        return value;
      },
    },
  });

  return (tree) => {
    transformCherryBlocks(
      tree,
      // startTest: check if paragraph text starts with +++
      (node) => {
        if (node.type !== 'paragraph') return null;
        const text = getNodeText(node).trim();
        const match = text.match(START_PATTERN);
        if (!match) return null;
        return { open: match[1] === '-', title: match[2].trim() };
      },
      // endTest: check if paragraph text is exactly +++
      (node) => {
        if (node.type !== 'paragraph') return false;
        const text = getNodeText(node).trim();
        return END_PATTERN.test(text);
      },
      // createNode
      (attrs, children) => ({
        type: MDAST_TYPE,
        title: attrs.title,
        open: attrs.open,
        children: children.length > 0 ? children : [{ type: 'paragraph', children: [{ type: 'text', value: '' }] }],
      }),
    );
  };
}

export const remarkDetailPlugin = $remark('remarkCherryDetail', () => remarkCherryDetail);

export const detailSchema = $nodeSchema(NODE_NAME, () => ({
  content: 'block+',
  group: 'block',
  attrs: {
    title: { default: '' },
    open: { default: false },
  },
  defining: true,
  parseDOM: [
    // Paste from HTML: <details><summary>...</summary>...</details>
    {
      tag: 'details',
      getAttrs: (dom) => ({
        title: dom.querySelector('summary')?.textContent || '',
        open: dom.hasAttribute('open'),
      }),
      contentElement: (dom) => {
        const body = dom.querySelector('.cherry-detail-body');
        return body || dom;
      },
    },
    // Editor round-trip: div.cherry-detail-edit
    {
      tag: 'div.cherry-detail-edit',
      getAttrs: (dom) => ({
        title: dom.querySelector('.cherry-detail-summary')?.textContent?.trim() || '',
        open: dom.dataset.open === 'true',
      }),
      contentElement: '.cherry-detail-body',
    },
  ],
  // Use <div> instead of <details> to avoid native toggle conflicting with ProseMirror
  toDOM: (node) => [
    'div',
    {
      class: 'cherry-detail-edit',
      'data-open': node.attrs.open ? 'true' : 'false',
    },
    ['div', { class: 'cherry-detail-summary', contenteditable: 'false' }, node.attrs.title || defaultTitle()],
    ['div', { class: 'cherry-detail-body' }, 0],
  ],
  parseMarkdown: {
    match: (node) => node.type === MDAST_TYPE,
    runner: (state, node, type) => {
      state.openNode(type, { title: node.title || '', open: !!node.open });
      state.next(node.children);
      state.closeNode();
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === NODE_NAME,
    runner: (state, node) => {
      state.openNode(MDAST_TYPE, undefined, {
        title: node.attrs.title,
        open: node.attrs.open,
      });
      state.next(node.content);
      state.closeNode();
    },
  },
}));

export const insertDetailCommand = $command('InsertDetail', (ctx) => (title = '') =>
  (state, dispatch, view) => {
    const nodeType = state.schema.nodes[NODE_NAME];
    if (!nodeType) return false;

    const attrs = { title: title || defaultTitle(), open: true };

    // Use prosemirror wrapIn — robust, handles edge cases, preserves content
    if (wrapIn(nodeType, attrs)(state, dispatch, view)) return true;

    // Fallback: replace current block with a detail containing its content
    if (dispatch) {
      const { $from } = state.selection;
      if ($from.depth < 1) return false;
      const parent = $from.parent;
      const content = parent.content.size > 0
        ? parent.type.create(parent.attrs, parent.content)
        : state.schema.nodes.paragraph.create();
      const detailNode = nodeType.create(attrs, content);
      const from = $from.before($from.depth);
      const to = $from.after($from.depth);
      dispatch(state.tr.replaceWith(from, to, detailNode));
    }
    return true;
  },
);

export const detail = [remarkDetailPlugin, detailSchema, insertDetailCommand].flat();
