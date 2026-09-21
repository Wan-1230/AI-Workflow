import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }]
    }
  },
  {
    // TS/TSX 的未定义标识符由 tsc 负责判定，开启 no-undef 只会产生假阳性
    files: ['**/*.{ts,tsx}'],
    rules: {
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-unused-expressions': 'error'
    }
  },
  {
    // Node 侧 CommonJS 脚本：允许 require / process / console 等全局量。
    // 必须排在通用 rules 块之后 —— flat config 中后者覆盖前者，否则 no-console: off 不生效。
    files: ['**/*.cjs', '**/*.mjs', '*.config.js', 'postcss.config.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        require: 'readonly',
        module: 'writable',
        exports: 'writable',
        process: 'readonly',
        console: 'readonly',
        URL: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        fetch: 'readonly'
      }
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      // 下载脚本的 stdout 就是它的产品界面
      'no-console': 'off',
      'no-undef': 'off'
    }
  },
  {
    ignores: ['node_modules/**', 'out/**', 'dist/**', 'release/**', 'packages/shared/dist/**']
  }
)
