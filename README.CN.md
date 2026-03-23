<p align="center"><img src="logo/new_logo.png" alt="super-doc logo" width="50%"/></p>

# SuperDoc

简体中文 | [English](./README.md)

## 关于本项目

SuperDoc (`@desirecore/super-doc`) 是 [Tencent/cherry-markdown](https://github.com/Tencent/cherry-markdown) 的独立维护分支。

### 为什么独立维护？

本项目源自我们在实际业务中对 cherry-markdown 的深度定制。我们曾尝试将修改合并回上游，但由于改动范围过大——特别是新增了基于 Milkdown/ProseMirror 的完整 WYSIWYG 编辑模式、流式渲染引擎，以及大量自定义 ProseMirror 节点——与上游的架构和设计方向产生了显著差异。

为了不给上游维护者带来不合理的代码审查和维护负担，同时避免对现有 cherry-markdown 使用者引入潜在的兼容性问题，我们选择以独立包的形式发布和维护。

**我们希望明确以下几点：**

- [cherry-markdown](https://github.com/Tencent/cherry-markdown) 是由腾讯 Cherry Oteam 打造的优秀 Markdown 编辑器，我们对原作者和所有贡献者的工作深表敬意。
- 本项目采用与原项目相同的 Apache License 2.0 协议。上游的 LICENSE 文件（包含所有第三方组件声明）已完整保留并随本包一同分发。
- 我们不以 "Tencent" 或 "CherryMarkdown" 的名义进行任何品牌背书。SuperDoc 是独立的衍生作品。
- 我们建议评估 Markdown 编辑器的开发者也了解原版 [cherry-markdown](https://github.com/Tencent/cherry-markdown)，该项目仍在积极维护中。

---

## SuperDoc 新增内容

完整变更日志请参见 [wiki](https://github.com/desirecore/super-doc/wiki/SuperDoc-%E6%96%B0%E5%A2%9E%E7%89%B9%E6%80%A7%E4%B8%8E%E4%BF%AE%E6%94%B9%E8%AF%B4%E6%98%8E)。

### WYSIWYG 所见即所得编辑模式

基于 [Milkdown](https://milkdown.dev/) / ProseMirror 构建的完整富文本编辑器，支持工具栏一键切换 Markdown 源码编辑与富文本编辑。包含图片拖拽缩放与对齐、可编辑 TOC 目录、脚注、draw.io 流程图、音视频嵌入、Panel 面板、Ruby 注音、可折叠 Detail 等自定义节点。

### Stream 流式渲染模式

专为 AI 聊天场景设计的轻量级 Engine + Previewer 组合，构建产物为 `super-doc.stream.js`，不含编辑器 UI 和工具栏，对逐字流式输出做了专项优化——代码块、行内公式、表格等结构会自动闭合。

### 其他增强

- 富文本标记：字体颜色、背景色、字号、高亮、下划线、上下标
- 新增 11 个工具栏按钮（脚注、draw.io、音频、文件、图表、颜色、字号、Ruby、Panel、Detail、PDF 导出）
- 修复 30+ 个 bug（KaTeX 渲染、表格编辑、超链接、粘贴处理、公式渲染等）

---

## 介绍

SuperDoc 是一款 Javascript Markdown 编辑器，具有开箱即用、轻量简洁、易于扩展等特点。它可以运行在浏览器或服务端（NodeJs）。

### 文档

- [初识编辑器](https://github.com/desirecore/super-doc/wiki/%E5%88%9D%E8%AF%86-cherry-markdown-%E7%BC%96%E8%BE%91%E5%99%A8)
- [Hello World](https://github.com/desirecore/super-doc/wiki/hello-world)
- [配置图片 & 文件上传接口](https://github.com/desirecore/super-doc/wiki/%E9%85%8D%E7%BD%AE%E5%9B%BE%E7%89%87&%E6%96%87%E4%BB%B6%E4%B8%8A%E4%BC%A0%E6%8E%A5%E5%8F%A3)
- [调整工具栏](https://github.com/desirecore/super-doc/wiki/%E8%B0%83%E6%95%B4%E5%B7%A5%E5%85%B7%E6%A0%8F)
- [配置项全解](https://github.com/desirecore/super-doc/wiki/%E9%85%8D%E7%BD%AE%E9%A1%B9%E5%85%A8%E8%A7%A3)
- [自定义语法](https://github.com/desirecore/super-doc/wiki/%E8%87%AA%E5%AE%9A%E4%B9%89%E8%AF%AD%E6%B3%95)
- [配置主题](https://github.com/desirecore/super-doc/wiki/%E9%85%8D%E7%BD%AE%E4%B8%BB%E9%A2%98)
- [扩展代码块语法](https://github.com/desirecore/super-doc/wiki/%E6%89%A9%E5%B1%95%E4%BB%A3%E7%A0%81%E5%9D%97%E8%AF%AD%E6%B3%95)
- [事件 & 回调](https://github.com/desirecore/super-doc/wiki/%E4%BA%8B%E4%BB%B6&%E5%9B%9E%E8%B0%83)
- [WYSIWYG 编辑模式](https://github.com/desirecore/super-doc/wiki/WYSIWYG-%E6%89%80%E8%A7%81%E5%8D%B3%E6%89%80%E5%BE%97%E7%BC%96%E8%BE%91%E6%A8%A1%E5%BC%8F)
- [Stream 流式渲染](https://github.com/desirecore/super-doc/wiki/Stream-%E6%B5%81%E5%BC%8F%E6%B8%B2%E6%9F%93%E6%A8%A1%E5%BC%8F)

-----

### 开箱即用

开发者可以用非常简单的方式调用并实例化 SuperDoc 编辑器，实例化的编辑器默认支持绝大多数常用的 markdown 语法（例如标题、目录、流程图、公式等）。

### 易于扩展

当 SuperDoc 默认支持的语法无法满足需求时，可以进行二次开发或功能扩展。SuperDoc 基于纯 JavaScript 实现，不依赖 Angular、Vue、React 等框架（框架仅作为容器环境）。

### 流式渲染

开启流式渲染后，SuperDoc 会对以下语法进行**自动补全**，避免出现 Markdown 源码，以达到在流式输出过程中稳定输出的效果：

- 标题
- 加粗、斜体
- 超链接
- 图片、音视频
- 行内代码块
- 段落代码块
- 行内公式
- 段落公式
- 无序列表
- 表格
- mermaid 图表
- 脚注

## 功能

### 语法功能

1. 图片缩放、对齐与引用
2. 根据表格内容生成图表
3. 字体颜色与字号调整
4. 字体背景色、上标与下标
5. 插入清单（checklist）
6. 插入音视频
7. 流程图（mermaid）、公式（数学）
8. 信息面板

### 功能特性

1. 从富文本复制并粘贴为 Markdown
2. 经典换行与常规换行支持
3. 多光标编辑
4. 图片尺寸编辑
5. Mermaid 图表尺寸编辑与对齐布局（拖拽缩放、支持居中/左/右/浮动对齐）
6. 表格编辑
7. 根据表格内容生成图表（表格 -> 图表）
8. 导出为图片或 PDF
9. 浮动工具栏：在新行行首出现
10. 气泡工具栏：选中文本时出现
11. 设置快捷键
12. 悬浮目录
13. 主题切换
14. 输入联想
15. AI Chat 场景流式输出支持
16. **WYSIWYG 模式：一键切换 Markdown 与富文本编辑** *(SuperDoc 新增)*

### 性能特性

1. 局部渲染
2. 局部更新

### 安全

SuperDoc 内置安全钩子，通过白名单过滤和 DomPurify 进行扫描过滤。

### 样式主题

提供多种主题样式可选。

## 安装

通过 yarn

```bash
yarn add @desirecore/super-doc
```

通过 npm

```bash
npm install @desirecore/super-doc --save
```

如果需要启用 mermaid 绘图和表格转图表功能，需要同时安装 `mermaid` 与 `echarts`。

## 快速开始

### 浏览器

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

## 轻量版本

由于 mermaid 库体积较大，SuperDoc 提供了不内置 mermaid 的核心构建包，可按需引入。

### 完整模式（图形界面）

```javascript
import '@desirecore/super-doc/dist/super-doc.css';
import Cherry from '@desirecore/super-doc/dist/super-doc.core';
const cherryInstance = new Cherry({
  id: 'markdown-container',
  value: '# welcome to SuperDoc!',
});
```

### 引擎模式（语法编译）

```javascript
// 导入 SuperDoc 引擎核心构建包
import CherryEngine from '@desirecore/super-doc/dist/super-doc.engine.core';
const cherryEngineInstance = new CherryEngine();
const htmlContent = cherryEngineInstance.makeHtml('# welcome to SuperDoc!');

// --> <h1>welcome to SuperDoc!</h1>
```

### 关于 mermaid ⚠️

核心构建包不包含 mermaid 依赖，需要手动引入相关插件。

```javascript
import '@desirecore/super-doc/dist/super-doc.css';
import Cherry from '@desirecore/super-doc/dist/super-doc.core';
import CherryMermaidPlugin from '@desirecore/super-doc/dist/addons/cherry-code-block-mermaid-plugin';
import mermaid from 'mermaid';

// 插件注册必须在 Cherry 实例化之前完成
Cherry.usePlugin(CherryMermaidPlugin, {
  mermaid, // 传入 mermaid 对象
});

const cherryInstance = new Cherry({
  id: 'markdown-container',
  value: '# welcome to SuperDoc!',
});
```

### 流式输出包（Stream Build）

SuperDoc 提供了专为流式输出场景优化的构建包，该包不包含 mermaid、CodeMirror 等大型依赖，可实现按需懒加载，非常适合 AI Chat 等场景。

```javascript
import '@desirecore/super-doc/dist/super-doc.css';
import Cherry from '@desirecore/super-doc/dist/super-doc.stream';

const cherryInstance = new Cherry({
  id: 'markdown-container',
});

cherryInstance.setMarkdown('# welcome to SuperDoc!');
```

#### 流式输出包与核心包的区别

| 构建包     | 文件                  | 包含 Mermaid | 包含 CodeMirror | 适用场景         |
| ---------- | --------------------- | ------------ | --------------- | ---------------- |
| 完整包     | `super-doc.js`        | ✅            | ✅               | 通用场景         |
| 核心包     | `super-doc.core.js`   | ❌            | ✅               | 不需要 Mermaid   |
| 流式输出包 | `super-doc.stream.js` | ❌            | ❌               | AI Chat 流式输出 |

> 注意：MathJax/KaTeX 为外部依赖，通过 CDN 动态加载，不包含在任何构建包中。

### 异步加载

强烈推荐使用动态引入（Dynamic import），下面给出 webpack 动态引入的示例。

```javascript
import '@desirecore/super-doc/dist/super-doc.css';
import Cherry from '@desirecore/super-doc/dist/super-doc.core';

const registerPlugin = async () => {
  const [{ default: CherryMermaidPlugin }, mermaid] = await Promise.all([
    import('@desirecore/super-doc/src/addons/cherry-code-block-mermaid-plugin'),
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

## 配置

所有配置项基本都在 `/src/Cherry.config.js` 中进行了标注，详见：[配置项全解](https://github.com/desirecore/super-doc/wiki/%E9%85%8D%E7%BD%AE%E9%A1%B9%E5%85%A8%E8%A7%A3)

## 示例

点击查看 [Wiki 文档](https://github.com/desirecore/super-doc/wiki)

### 客户端

正在开发中，可查看 `packages/client/` 目录。

## 扩展

### 自定义语法

详见 [自定义语法文档](https://github.com/desirecore/super-doc/wiki/%E8%87%AA%E5%AE%9A%E4%B9%89%E8%AF%AD%E6%B3%95)

### 自定义工具栏

SuperDoc 支持五种工具栏位置，每个位置都可以扩展自定义工具按钮，详情见：[自定义工具栏按钮](https://github.com/desirecore/super-doc/wiki/%E8%B0%83%E6%95%B4%E5%B7%A5%E5%85%B7%E6%A0%8F#%E8%87%AA%E5%AE%9A%E4%B9%89%E5%B7%A5%E5%85%B7%E6%A0%8F%E6%8C%89%E9%92%AE)。

## 单元测试

已经添加了基础的 `Vitest` 配置及测试用例，欢迎提交更丰富的测试。

## 致谢

本项目是 [cherry-markdown](https://github.com/Tencent/cherry-markdown) 的衍生作品，原项目由腾讯 Cherry Oteam 开发并以 Apache License 2.0 发布。感谢原作者和所有贡献者打造了如此优秀的基础。

## License

[Apache-2.0](./LICENSE)

本产品包含来自 Tencent/cherry-markdown 的软件。第三方组件声明详见 [LICENSE](./LICENSE) 文件。
