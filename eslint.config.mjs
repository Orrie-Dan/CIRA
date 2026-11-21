import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Baseline: lint was never enforced before, and these rules have existing
    // violations across the codebase. They are warnings until that debt is
    // paid down; once a rule is clean, remove it from this list.
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      // Flags the fetch-on-mount pattern (an effect calling a loader that sets
      // `loading` synchronously) used by every data page. The React Compiler
      // is not enabled, so this is advisory; clearing it means moving data
      // loading to a fetching library, which is a refactor of its own.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  {
    // CommonJS tooling config files.
    files: ['**/*.config.js', 'jest.setup.js'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  // api/ and mobile/ are separate projects with their own tooling.
  globalIgnores(['node_modules/', '.next/', 'next-env.d.ts', 'api/', 'mobile/']),
])
