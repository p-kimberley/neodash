// ESLint 9 flat config (converted from .eslintrc.json; the rules are unchanged unless noted).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'server/**',
      'docs/**',
      'gallery/**',
      'packages/**/dist/**',
      'packages/**/coverage/**',
      'dev/e2e/report/**',
      'dev/e2e/test-results/**',
      'dev/e2e/node_modules/**',
      'dev/e2e/.scratch/**',
    ],
  },
  js.configs.recommended,
  // Dev and build scripts (seed data, the browser regression suite, docs and release tooling) run in Node.
  { files: ['dev/**/*.{js,mjs}', 'scripts/**/*.{js,mjs}'], languageOptions: { globals: { ...globals.node } } },
  // Browser-side callbacks (page.evaluate) in the regression suite.
  { files: ['dev/e2e/tests/**/*.mjs'], languageOptions: { globals: { ...globals.browser } } },
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { react },
    settings: { react: { version: 'detect' } },
    languageOptions: {
      globals: { ...globals.browser, ...globals.node, ...globals.jest, cy: 'readonly', Cypress: 'readonly' },
    },
    // no-new-object is now no-object-constructor; caughtErrors: 'none' keeps typescript-eslint 5's
    // behaviour for unused catch variables.
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
          caughtErrors: 'none',
        },
      ],
      'array-callback-return': 'off',
      'arrow-body-style': 'off',
      'block-scoped-var': 'error',
      camelcase: 'off',
      'consistent-return': 'off',
      'consistent-this': ['error', 'self'],
      'constructor-super': 'error',
      curly: ['error', 'all'],
      'default-case': 'error',
      'default-param-last': 'off',
      'dot-notation': 'error',
      eqeqeq: 'off',
      'func-names': 'error',
      'func-style': [
        'error',
        'declaration',
        {
          allowArrowFunctions: true,
        },
      ],
      'grouped-accessor-pairs': 'error',
      'line-comment-position': 'off',
      'lines-between-class-members': 'error',
      'max-depth': 'error',
      'max-len': [
        'off',
        {
          code: 120,
          comments: 120,
          ignoreUrls: true,
          ignoreTemplateLiterals: true,
        },
      ],
      'max-lines-per-function': ['off'],
      'max-nested-callbacks': ['error', 5],
      'max-statements': ['off'],
      'max-statements-per-line': 'error',
      'no-alert': 'off',
      'no-array-constructor': 'error',
      'no-await-in-loop': 'off',
      'no-buffer-constructor': 'error',
      'no-caller': 'error',
      // Deprecated formatting rule that conflicts with Prettier 3 (which drops the parentheses it wants).
      'no-confusing-arrow': 'off',
      'no-console': 'warn',
      'no-constructor-return': 'error',
      'no-constant-condition': 'error',
      'no-debugger': 'warn',
      'no-dupe-else-if': 'error',
      'no-else-return': 'error',
      'no-empty-function': [
        'off',
        {
          allow: ['constructors'],
        },
      ],
      'no-eq-null': 'off',
      'no-eval': 'error',
      'no-extend-native': 'error',
      'no-extra-bind': 'error',
      'no-extra-label': 'error',
      'no-implicit-coercion': 'error',
      'no-implicit-globals': 'error',
      'no-implied-eval': 'error',
      'no-import-assign': 'error',
      'no-invalid-this': 'off',
      'no-iterator': 'error',
      'no-labels': 'error',
      'no-lone-blocks': 'error',
      'no-lonely-if': 'error',
      'no-loop-func': 'error',
      'no-magic-numbers': 'off',
      'no-multi-assign': 'error',
      'no-multi-str': 'error',
      'no-nested-ternary': 'off',
      'no-new': 'error',
      'no-new-func': 'error',
      'no-new-wrappers': 'error',
      'no-octal-escape': 'error',
      'no-param-reassign': 'off',
      'no-path-concat': 'error',
      'no-plusplus': [
        'error',
        {
          allowForLoopAfterthoughts: true,
        },
      ],
      'no-proto': 'off',
      'no-restricted-globals': 'error',
      'no-return-assign': 'error',
      'no-return-await': 'error',
      'no-self-compare': 'error',
      'no-sequences': 'error',
      'no-setter-return': 'error',
      'no-sync': 'error',
      'no-tabs': 'error',
      'no-template-curly-in-string': 'error',
      'no-underscore-dangle': 'off',
      'no-unmodified-loop-condition': 'error',
      'no-unneeded-ternary': 'error',
      'no-unreachable': 'error',
      'no-unused-expressions': 'off',
      // typescript-eslint 8's recommended set turns on its own copy of the rule above.
      '@typescript-eslint/no-unused-expressions': 'off',
      'no-useless-call': 'error',
      'no-useless-computed-key': 'error',
      'no-useless-concat': 'off',
      'no-useless-rename': 'error',
      'no-useless-return': 'error',
      'no-var': 'error',
      'no-void': [
        'error',
        {
          allowAsStatement: true,
        },
      ],
      'one-var': ['error', 'never'],
      'operator-assignment': 'error',
      'padding-line-between-statements': 'error',
      'prefer-arrow-callback': 'warn',
      'prefer-const': 'off',
      'prefer-destructuring': [
        'warn',
        {
          VariableDeclarator: {
            array: true,
            object: true,
          },
          AssignmentExpression: {
            array: false,
            object: false,
          },
        },
      ],
      'prefer-numeric-literals': 'warn',
      'prefer-promise-reject-errors': 'warn',
      'prefer-rest-params': 'warn',
      'prefer-spread': 'warn',
      'prefer-template': 'warn',
      radix: 'off',
      'require-atomic-updates': 'error',
      'require-await': 'warn',
      'sort-keys': 'off',
      'spaced-comment': [
        'warn',
        'always',
        {
          markers: ['/'],
        },
      ],
      'symbol-description': 'error',
      yoda: 'error',
      'no-object-constructor': 'error',
    },
  },
  {
    // Dialogs close on a backdrop click through the app's wrapper; NDL's own Dialog ignores those.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/component/dialog/Dialog.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@neo4j-ndl/react',
              importNames: ['Dialog'],
              message: "Use Dialog from 'component/dialog/Dialog', which also closes on a backdrop click.",
            },
          ],
        },
      ],
    },
  },
  {
    // Vendored, transpiled Frappe Gantt (see its README): not cleaned up line by line.
    files: ['src/extensions/advancedcharts/chart/gantt/frappe/lib/**'],
    rules: { '@typescript-eslint/no-unused-vars': 'off' },
  }
);
