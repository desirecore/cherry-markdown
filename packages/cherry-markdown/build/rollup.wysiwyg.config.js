/**
 * WYSIWYG 构建配置
 *
 * 基于 index.wysiwyg.js 入口，产出包含 Milkdown Crepe WYSIWYG 完整功能的 Cherry 构建。
 * @milkdown/* 作为 external 依赖，消费者需自行安装。
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

// Milkdown 相关包作为 external，不打入 bundle
const milkdownExternal = [
  '@milkdown/crepe',
  '@milkdown/kit',
  '@milkdown/kit/utils',
  '@milkdown/crepe/theme/common/style.css',
  '@milkdown/crepe/theme/frame.css',
];

export default {
  ...baseConfig,
  input: 'src/index.wysiwyg.js',
  external: [...(baseConfig.external || []), ...milkdownExternal],
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
      globals: {
        ...baseConfig.output?.globals,
        '@milkdown/crepe': 'MilkdownCrepe',
        '@milkdown/kit': 'MilkdownKit',
        '@milkdown/kit/utils': 'MilkdownKitUtils',
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
