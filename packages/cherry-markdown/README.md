<p align="center"><img src="logo/new_logo.png" alt="super-doc logo" width="50%"/></p>

# SuperDoc

English | [简体中文](./README.CN.md)

## About This Project

SuperDoc (`@desirecore/super-doc`) is an independently maintained fork of [Tencent/cherry-markdown](https://github.com/Tencent/cherry-markdown).

### Why a separate fork?

This project originated from contributions we attempted to merge back into the upstream repository. However, our changes — particularly the addition of a full WYSIWYG editing mode based on Milkdown/ProseMirror, a streaming rendering engine, and numerous custom ProseMirror nodes — have diverged significantly from upstream in both scope and architecture. To avoid placing an unreasonable review and maintenance burden on the upstream maintainers, and to prevent introducing compatibility issues for existing cherry-markdown users, we chose to maintain and publish this as a separate package.

**We want to be clear:**

- The original [cherry-markdown](https://github.com/Tencent/cherry-markdown) is an excellent Markdown editor created by the Cherry Oteam at Tencent. We have great respect for their work and all contributors.
- This project is licensed under Apache License 2.0, the same license as the original. The upstream LICENSE file (including all third-party component notices) is fully preserved and distributed with this package.
- We do not use the "Tencent" or "CherryMarkdown" names as brand endorsement. SuperDoc is an independent derivative work.
- We encourage anyone evaluating Markdown editors to also consider the original [cherry-markdown](https://github.com/Tencent/cherry-markdown), which remains actively maintained.

---

## What's New in SuperDoc

For the full changelog, see the [wiki](https://github.com/desirecore/super-doc/wiki/SuperDoc-%E6%96%B0%E5%A2%9E%E7%89%B9%E6%80%A7%E4%B8%8E%E4%BF%AE%E6%94%B9%E8%AF%B4%E6%98%8E).

### WYSIWYG Editing Mode

A complete What-You-See-Is-What-You-Get editor built on [Milkdown](https://milkdown.dev/) / ProseMirror, with one-click switching between Markdown source editing and rich-text editing. Includes custom nodes for images (drag-resize & alignment), editable TOC, footnotes, draw.io, audio/video, panels, ruby annotations, and collapsible details.

### Stream Rendering Mode

A lightweight Engine + Previewer combination designed for AI chat scenarios. Ships as `super-doc.stream.js` — no editor UI or toolbar, optimized for character-by-character streaming with auto-closing of code blocks, inline formulas, and tables.

### Additional Enhancements

- Rich text marks: font color, background color, font size, highlight, underline, sub/superscript
- 11 new toolbar buttons (footnote, draw.io, audio, file, graph, color, size, ruby, panel, detail, PDF export)
- 30+ bug fixes (KaTeX rendering, table editing, hyperlinks, paste handling, formula rendering, etc.)

---

## Introduction

SuperDoc is a Javascript Markdown editor. It has the advantages such as out-of-the-box, lightweight and easy to extend. It can run in browser or server (with NodeJs).

### Document

- [Getting Started](https://github.com/desirecore/super-doc/wiki/%E5%88%9D%E8%AF%86-cherry-markdown-%E7%BC%96%E8%BE%91%E5%99%A8)
- [Hello World](https://github.com/desirecore/super-doc/wiki/hello-world)
- [Configuring Image & File Upload](https://github.com/desirecore/super-doc/wiki/%E9%85%8D%E7%BD%AE%E5%9B%BE%E7%89%87&%E6%96%87%E4%BB%B6%E4%B8%8A%E4%BC%A0%E6%8E%A5%E5%8F%A3)
- [Adjusting the Toolbar](https://github.com/desirecore/super-doc/wiki/%E8%B0%83%E6%95%B4%E5%B7%A5%E5%85%B7%E6%A0%8F)
- [Configuration Options](https://github.com/desirecore/super-doc/wiki/%E9%85%8D%E7%BD%AE%E9%A1%B9%E5%85%A8%E8%A7%A3)
- [Custom Syntax](https://github.com/desirecore/super-doc/wiki/%E8%87%AA%E5%AE%9A%E4%B9%89%E8%AF%AD%E6%B3%95)
- [Configuring Themes](https://github.com/desirecore/super-doc/wiki/%E9%85%8D%E7%BD%AE%E4%B8%BB%E9%A2%98)
- [Extending Code Block Syntax](https://github.com/desirecore/super-doc/wiki/%E6%89%A9%E5%B1%95%E4%BB%A3%E7%A0%81%E5%9D%97%E8%AF%AD%E6%B3%95)
- [Events & Callbacks](https://github.com/desirecore/super-doc/wiki/%E4%BA%8B%E4%BB%B6&%E5%9B%9E%E8%B0%83)
- [WYSIWYG Mode](https://github.com/desirecore/super-doc/wiki/WYSIWYG-%E6%89%80%E8%A7%81%E5%8D%B3%E6%89%80%E5%BE%97%E7%BC%96%E8%BE%91%E6%A8%A1%E5%BC%8F)
- [Stream Rendering](https://github.com/desirecore/super-doc/wiki/Stream-%E6%B5%81%E5%BC%8F%E6%B8%B2%E6%9F%93%E6%A8%A1%E5%BC%8F)

-----

### **Out-of-the-box**

Developer can call and instantiate SuperDoc in a very simple way. The instantiated editor supports most commonly used markdown syntax (such as title, TOC, flowchart, formula, etc.) by default.

### **Easy to extend**

When the syntax that SuperDoc supports can not meet your needs, secondary development or function extension can be carried out quickly. SuperDoc is implemented in pure JavaScript, and does not rely on framework technology such as Angular, Vue or React. Framework only provides a container environment.

### Incremental / Progressive / Streaming rendering

After enabling streaming rendering, SuperDoc will automatically complete the following syntax elements to avoid exposing Markdown source code, ensuring stable output during the streaming process:
- Headings
- Bold and italic text
- Hyperlinks
- Images and audio/video
- Inline code blocks
- Block code blocks
- Inline formulas
- Block formulas
- Unordered lists
- Tables
- Mermaid diagrams
- Footnotes

## Feature

### Syntax Feature

1. Image zoom, alignment and reference
2. Generate a chart based on table content
3. Adjust font color and size
4. Font background color, superscript and subscript
5. Insert checklist
6. Insert audio and video
7. Mermaid diagrams and math formulas
8. Info panels

### Functional Feature

1. Paste from rich text as markdown
2. Classic & regular line break modes
3. Multi-cursor editing
4. Image size editing
5. Mermaid diagram size editing and alignment (drag to resize, support center/left/right/float alignment)
6. Table editing
7. Table -> Chart (generate chart from table content)
8. Export as image or PDF
9. Floating toolbar: appears at the beginning of a new line
10. Bubble toolbar: appears when text is selected
11. Set shortcut keys
12. Floating table of contents
13. Theme switching
14. Input suggestion (autocomplete)
15. AI Chat scenario: stream-mode output supported
16. **WYSIWYG mode: one-click switch between Markdown and rich-text editing** *(SuperDoc)*

### Performance Feature

1. Partial rendering
2. Partial update

### Security

SuperDoc has a built-in security Hook, by filtering the whitelist and DomPurify to do scan filter.

### Style theme

SuperDoc has a variety of style themes to choose from.

## Install

Via yarn

```bash
yarn add @desirecore/super-doc
```

Via npm

```bash
npm install @desirecore/super-doc --save
```

If you need to enable the functions of `mermaid` drawing and table-to-chart, you need to add `mermaid` and `echarts` packages at the same time.

## Quick start

### Browser

#### UMD

```html
<link href="super-doc.min.css" />
<div id="markdown-container"></div>
<script src="super-doc.js"></script>
<script>
  new Cherry({
    id: 'markdown-container',
    value: '# welcome to SuperDoc!',
  });
</script>
```

#### ESM

```javascript
import '@desirecore/super-doc/dist/super-doc.css';
import Cherry from '@desirecore/super-doc';
const cherryInstance = new Cherry({
  id: 'markdown-container',
  value: '# welcome to SuperDoc!',
});
```

### Node

```javascript
const { default: CherryEngine } = require('@desirecore/super-doc/dist/super-doc.engine.core.common');
const cherryEngineInstance = new CherryEngine();
const htmlContent = cherryEngineInstance.makeHtml('# welcome to SuperDoc!');
```

## Lite Version

Because the size of the mermaid library is very large, the build product contains a core build package without built-in Mermaid. The core build can be imported in the following ways.

### Full mode (With UI Interface)

```javascript
import '@desirecore/super-doc/dist/super-doc.css';
import Cherry from '@desirecore/super-doc/dist/super-doc.core';
const cherryInstance = new Cherry({
  id: 'markdown-container',
  value: '# welcome to SuperDoc!',
});
```

### Engine Mode (Just Syntax Compile)

```javascript
import CherryEngine from '@desirecore/super-doc/dist/super-doc.engine.core';
const cherryEngineInstance = new CherryEngine();
const htmlContent = cherryEngineInstance.makeHtml('# welcome to SuperDoc!');

// --> <h1>welcome to SuperDoc!</h1>
```

### ⚠️ About mermaid

The core build package does not contain mermaid dependency, should import related plug-ins manually.

```javascript
import '@desirecore/super-doc/dist/super-doc.css';
import Cherry from '@desirecore/super-doc/dist/super-doc.core';
import CherryMermaidPlugin from '@desirecore/super-doc/dist/addons/cherry-code-block-mermaid-plugin.esm.js';
import mermaid from 'mermaid';

// Plug-in registration must be done before Cherry is instantiated
Cherry.usePlugin(CherryMermaidPlugin, {
  mermaid, // pass in mermaid object
});

const cherryInstance = new Cherry({
  id: 'markdown-container',
  value: '# welcome to SuperDoc!',
});
```

### Stream Build

SuperDoc provides a build package optimized for streaming output scenarios. This package does not include large dependencies like mermaid or CodeMirror, enabling on-demand lazy loading. It is ideal for AI Chat and similar scenarios.

```javascript
import '@desirecore/super-doc/dist/super-doc.css';
import Cherry from '@desirecore/super-doc/dist/super-doc.stream';

const cherryInstance = new Cherry({
  id: 'markdown-container',
});

cherryInstance.setMarkdown('# welcome to SuperDoc!');
```

#### Differences Between Stream Build and Core Build

| Build  | File                  | Mermaid | CodeMirror | Use Case          |
| ------ | --------------------- | ------- | ---------- | ----------------- |
| Full   | `super-doc.js`        | ✅       | ✅          | General purpose   |
| Core   | `super-doc.core.js`   | ❌       | ✅          | Without Mermaid   |
| Stream | `super-doc.stream.js` | ❌       | ❌          | AI Chat streaming |

> Note: MathJax/KaTeX are external dependencies loaded dynamically via CDN and are not included in any build package.

### Dynamic import

**Recommended:** Using Dynamic import, the following is an example of webpack Dynamic import.

```javascript
import '@desirecore/super-doc/dist/super-doc.css';
import Cherry from '@desirecore/super-doc/dist/super-doc.core';

const registerPlugin = async () => {
  const [{ default: CherryMermaidPlugin }, { default: mermaid }] = await Promise.all([
    import('@desirecore/super-doc/dist/addons/cherry-code-block-mermaid-plugin.esm.js'),
    import('mermaid'),
  ]);
  Cherry.usePlugin(CherryMermaidPlugin, {
    mermaid,
  });
};

registerPlugin().then(() => {
  const cherryInstance = new Cherry({
    id: 'markdown-container',
    value: '# welcome to SuperDoc!',
  });
});
```

Register the plug-in before creating the first `Cherry` instance. Passing the
Mermaid module is preferred for strict CSP/Electron applications; do not depend
on a remotely injected script. The optional `src` option is only for a trusted,
application-controlled classic/UMD script and falls back to the source block if
it cannot load.

## Configuration

See `/src/Cherry.config.js` or check the [Configuration Options](https://github.com/desirecore/super-doc/wiki/%E9%85%8D%E7%BD%AE%E9%A1%B9%E5%85%A8%E8%A7%A3) wiki page.

## Example

Click [here](https://github.com/desirecore/super-doc/wiki) for more examples.

### Client

Under development, please see `/packages/client/`.

## Extension

### Customize Syntax

See the custom syntax documentation: [Custom syntax docs](https://github.com/desirecore/super-doc/wiki/%E8%87%AA%E5%AE%9A%E4%B9%89%E8%AF%AD%E6%B3%95)

### Customize Toolbar

SuperDoc supports five toolbar positions, each position can be extended with custom toolbar buttons. See the toolbar configuration documentation for details: [Customize toolbar buttons](https://github.com/desirecore/super-doc/wiki/%E8%B0%83%E6%95%B4%E5%B7%A5%E5%85%B7%E6%A0%8F#%E8%87%AA%E5%AE%9A%E4%B9%89%E5%B7%A5%E5%85%B7%E6%A0%8F%E6%8C%89%E9%92%AE).

## Unit Test

`Vitest` has been added as a basic configuration with test cases. Welcome to submit more test cases.

## Acknowledgments

This project is a derivative work of [cherry-markdown](https://github.com/Tencent/cherry-markdown), originally developed by the Cherry Oteam at Tencent and licensed under the Apache License 2.0. We are grateful to the original authors and all contributors for creating such a solid foundation.

## License

[Apache-2.0](./LICENSE)

This product includes software developed by Tencent/cherry-markdown. Third-party component notices are provided in the [LICENSE](./LICENSE) file.
