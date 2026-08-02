import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      // Non-null assertions are legitimate in well-tested TypeScript code.
      '@typescript-eslint/no-non-null-assertion': 'off',
      // Template literals with number types are safe in practice.
      '@typescript-eslint/restrict-template-expressions': 'off',
      // Explicit any is forbidden in production code; test files have relaxed rules.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/consistent-type-exports': 'error',
      // Allow inferrable types for clarity.
      '@typescript-eslint/no-inferrable-types': 'off',
      // Known debt (I12+): tighten these rules progressively.
      // I33: require-await and no-base-to-string now enforced as errors.
      // no-unnecessary-condition set to warn — it flags defensive ?. and ??
      // patterns that are type-safe but intentionally guarded at runtime.
      // Tracked for periodic manual review.
      '@typescript-eslint/require-await': 'error',
      '@typescript-eslint/no-base-to-string': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'warn',
      'no-control-regex': 'off',
      'no-useless-escape': 'off',
    },
  },
  // Relaxed rules for test files — test code needs flexibility for mocks and fixtures.
  {
    files: ['packages/**/__tests__/**/*.ts', 'packages/**/__tests__/**/*.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/no-base-to-string': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/unbound-method': 'off',
    },
  },
  // Server package — I33: no-unsafe-* rules now enabled.
  // Production code must have full type safety.
  {
    files: ['packages/entity-resolver-server/src/**/*.ts'],
    rules: {},
  },
  {
    ignores: ['dist/', 'coverage/', '*.config.*', 'vitest.*', 'e2e/', '**/scorers/wasm/scorers/*.js', '**/scorers/wasm/scorers/*.d.ts', 'packages/*/dist/'],
  },
);
