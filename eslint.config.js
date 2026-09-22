import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores(['dist/', 'node_modules/', '.worktrees/', '.review-evidence/', 'playwright-report/', 'test-results/']),
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    // A stale eslint-disable must fail lint, not warn: `pnpm lint` exits 0 on warnings.
    linterOptions: { reportUnusedDisableDirectives: 'error' },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // tsconfig sets noUncheckedIndexedAccess, so `!` on an index or a Params lookup is the idiom here, not a smell.
      '@typescript-eslint/no-non-null-assertion': 'off',
      // Options replace the preset's wholesale, so restate its strict set and relax only numbers.
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowAny: false, allowBoolean: false, allowNever: false, allowNullish: false, allowNumber: true, allowRegExp: false },
      ],
      // `() => o.onReset()` is the house style for handlers; the rule still catches void values used elsewhere.
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
    },
  },
  // Last, so nothing above re-enables a type-aware rule for it. This file is the only .js and is not in tsconfig.
  { files: ['**/*.js'], extends: [tseslint.configs.disableTypeChecked] },
);
