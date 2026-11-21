// @ts-check
import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', 'coverage/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // An un-awaited promise in a request handler or hook is a silently
      // dropped error (or an unhandled rejection that kills the process).
      '@typescript-eslint/no-floating-promises': 'error',
      // Fastify awaits async hooks/handlers, but its hook types are a union
      // with the callback style (void return), so `preHandler: asyncFn` in
      // route options is a false positive. Every other position stays checked.
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { properties: false } }],
      '@typescript-eslint/await-thenable': 'error',
    },
  },
  {
    rules: {
      // Baseline: lint was never run on the API; existing `any`s are warnings
      // until paid down (same approach as the web config).
      '@typescript-eslint/no-explicit-any': 'warn',
      // `let timer; const close = () => clearInterval(timer); timer = setInterval(...)`
      // is deliberate: a const would be in the TDZ if close() ran first.
      'prefer-const': ['error', { ignoreReadBeforeAssign: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
)
