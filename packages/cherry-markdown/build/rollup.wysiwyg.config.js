/**
 * WYSIWYG 构建配置
 *
 * 基于 index.wysiwyg.js 入口，产出包含 Milkdown Crepe WYSIWYG 完整功能的 Cherry 构建。
 * @milkdown/* 作为 external 依赖，消费者需自行安装。
 * CSS 导入在构建时移除，消费者需自行引入 @milkdown/crepe 的 CSS。
 */
import terser from '@rollup/plugin-terser';
import baseConfig from './rollup.base.config.js';

const terserPlugin = (options = {}) =>
  terser({
    output: {
      comments: false,
    },
    compress: {
      pure_funcs: ['console.log', 'console.info'],
    },
    ecma: 5,
    ...options,
  });

// ProseMirror 包必须与 Milkdown 共享同一实例
const prosemirrorExternal = (id) => /^prosemirror-/.test(id);

/**
 * 将模块 ID 转为合法的 UMD global 名称
 * e.g. '@milkdown/kit/preset/commonmark' → 'Milkdown_kit_preset_commonmark'
 */
function milkdownToGlobal(id) {
  return id.replace(/^@milkdown\//, 'Milkdown_').replace(/[/-]/g, '_');
}

/**
 * Rollup 插件：移除 CSS 导入语句
 * CSS 文件不能被 esbuild / Vite 预构建正确处理，
 * 消费者应在自己的入口中单独 import CSS。
 */
function stripCssImports() {
  return {
    name: 'strip-css-imports',
    resolveId(source) {
      if (source.endsWith('.css')) {
        return { id: source, external: false, moduleSideEffects: false };
      }
      return null;
    },
    load(id) {
      if (id.endsWith('.css')) {
        return '';
      }
      return null;
    },
  };
}

export default {
  ...baseConfig,
  input: 'src/index.wysiwyg.js',
  plugins: [
    stripCssImports(),
    ...(baseConfig.plugins || []),
  ],
  external: (id) => {
    const baseExternals = [...(baseConfig.external || [])];
    if (baseExternals.includes(id)) return true;
    // All @milkdown/* packages must be external to share instances with Crepe
    if (id.startsWith('@milkdown/')) return true;
    // ProseMirror 包必须与 Milkdown 共享同一实例
    if (prosemirrorExternal(id)) return true;
    return false;
  },
  treeshake: false,
  output: [
    {
      ...baseConfig.output,
      exports: 'named',
      file: 'dist/super-doc.wysiwyg.js',
      format: 'umd',
      name: 'Cherry',
      sourcemap: true,
      compact: false,
      inlineDynamicImports: true,
      globals: (id) => {
        const baseGlobals = baseConfig.output?.globals || {};
        if (typeof baseGlobals === 'object' && baseGlobals[id]) return baseGlobals[id];
        if (id.startsWith('@milkdown/')) return milkdownToGlobal(id);
        const pmMap = {
          'prosemirror-model': 'ProsemirrorModel',
          'prosemirror-view': 'ProsemirrorView',
          'prosemirror-state': 'ProsemirrorState',
          'prosemirror-transform': 'ProsemirrorTransform',
          'prosemirror-commands': 'ProsemirrorCommands',
          'prosemirror-keymap': 'ProsemirrorKeymap',
          'prosemirror-inputrules': 'ProsemirrorInputrules',
          'prosemirror-schema-list': 'ProsemirrorSchemaList',
        };
        return pmMap[id] || id;
      },
    },
    {
      exports: 'named',
      file: 'dist/super-doc.wysiwyg.esm.js',
      format: 'esm',
      name: 'Cherry',
      sourcemap: false,
      compact: true,
      inlineDynamicImports: true,
      plugins: [
        terserPlugin({
          module: true,
          ecma: 2015,
        }),
      ],
    },
  ],
};
