# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Cherry Markdown is a JavaScript-based Markdown editor by Tencent. It runs in browsers and Node.js, supporting syntax extensions, streaming rendering (for AI chat), and a plugin system. Licensed under Apache-2.0.

## Monorepo Structure

Yarn workspaces monorepo with three packages under `packages/`:

- **`cherry-markdown`** — Core editor library (the main package). Pure JS, no framework dependency.
- **`client`** — Desktop app built with Tauri + Vue 3 + Pinia.
- **`vscodePlugin`** — VS Code extension for Markdown preview.

## Common Commands

```bash
# Install dependencies (also runs iconfont generation)
yarn install

# Development server (Vite)
yarn dev

# Build the core library (full build with all variants)
yarn build

# Run tests (vitest, jsdom environment)
yarn test

# Run a single test file
yarn workspace cherry-markdown vitest run test/core/SomeTest.test.js

# Update test snapshots
yarn test:update

# Lint all packages
yarn lint:all

# Lint with auto-fix
yarn lint:fix:all

# Desktop client dev/build
yarn dev:client
yarn build:client

# VS Code plugin build
yarn build:vscodePlugin

# Release (pull, build, commit, push, publish)
yarn release <version> [otp]
# Example: yarn release 0.2.11 123456
```

## Core Architecture (`packages/cherry-markdown/src/`)

### Entry Points & Build Variants

The library ships multiple builds controlled by different entry points:

| Entry | Description |
|---|---|
| `index.js` | Full bundle (Cherry + mermaid + plantuml + echarts) |
| `index.core.js` | Core bundle without heavy addons |
| `index.engine.js` | Engine-only (no editor UI, for server-side rendering) |
| `index.stream.js` | Stream variant for AI chat scenarios (no editor/toolbar) |

Each has a `.core` variant without mermaid. Build configs are in `build/` using Rollup, outputting ESM, UMD, and CJS formats.

### Key Components

- **`Cherry.js`** — Main class. Instantiates Editor, Engine, Previewer, and Toolbar. Extends `CherryStatic` (which holds `usePlugin()` for registering addons).
- **`CherryStream.js`** — Lightweight version with only Engine + Previewer for streaming scenarios.
- **`Engine.js`** — Markdown parsing engine. Manages `HookCenter` which orchestrates all syntax hooks. Uses LRU caching for render results.
- **`Editor.js`** — CodeMirror-based editor wrapper.
- **`Previewer.js`** — Manages preview DOM updates using virtual-dom diffing.
- **`Event.js`** — Event bus for inter-component communication.
- **`Cherry.config.js`** — Default configuration object.

### Syntax Hook System (`src/core/`)

The parsing pipeline is hook-based. Each Markdown syntax is a "hook" extending base classes:

- **`SyntaxBase.js`** — Base class for all hooks. Defines `HOOK_NAME`, `HOOK_TYPE` (sentence or paragraph).
- **`SentenceBase.js`** — For inline-level syntax (bold, links, inline code, etc.).
- **`ParagraphBase.js`** — For block-level syntax (code blocks, tables, lists, etc.).
- **`HookCenter.js`** — Registers and manages hook execution order.
- **`HooksConfig.js`** — Defines the ordered list of all syntax hooks. **Execution order matters** — hooks run in array order for `beforeMake`/`makeHtml`, reverse order for `afterMake`.

All syntax hooks live in `src/core/hooks/` (e.g., `Header.js`, `Table.js`, `CodeBlock.js`, `MathBlock.js`).

### Toolbar System (`src/toolbars/`)

- **`Toolbar.js`** — Main toolbar container.
- **`Bubble.js`** — Bubble toolbar (appears on text selection).
- **`FloatMenu.js`** — Float menu (appears at new line start).
- **`MenuBase.js`** — Base class for all toolbar buttons.
- **`PreviewerBubble.js`** — Preview-area bubble (for image/table editing).
- Individual toolbar buttons in `src/toolbars/hooks/` (e.g., `Bold.js`, `Image.js`).

### Plugin/Addon System (`src/addons/`)

Addons extend code block rendering. Registered via `Cherry.usePlugin()`:
- `cherry-code-block-mermaid-plugin.js` — Mermaid diagram rendering.
- `cherry-code-block-plantuml-plugin.js` — PlantUML rendering.
- `advance/cherry-table-echarts-plugin.js` — Table-to-chart via ECharts.

### Other Important Directories

- **`src/utils/`** — Shared utilities (DOM helpers, regex patterns, sanitization, export, math rendering).
- **`src/sass/`** — SCSS styles for the editor and preview.
- **`src/locales/`** — i18n translations.
- **`src/libs/`** — Vendored third-party libraries.

## Testing

Tests are in `packages/cherry-markdown/test/` using **Vitest** with jsdom environment. Path alias `@` maps to `src/`. Coverage is configured for `src/core/**/*.js`.

## Code Style

- Source is primarily **JavaScript** (`.js`) with JSDoc type annotations, not TypeScript (types are generated via `tsc` from JSDoc).
- Linting: ESLint with `eslint-config-tencent` + Prettier.
- Commit messages follow **Conventional Commits** (enforced by commitlint + husky).
- `lint-staged` runs ESLint fix on `*.js`/`*.ts` and Prettier on `*.{js,ts,json,md}`.

## Key Patterns

- Syntax hooks use regex-based matching. Each hook defines patterns in its constructor and implements `makeHtml(str)` / `rule()` methods.
- The engine processes markdown in two phases: paragraph-level hooks first, then sentence-level hooks within each paragraph.
- Virtual DOM diffing (`virtual-dom` library) is used in the Previewer for efficient DOM updates.
- Math rendering supports both MathJax and KaTeX (configurable).
- The `@` import alias resolves to `packages/cherry-markdown/src/`.
