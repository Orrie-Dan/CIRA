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
      '@typescript-eslint/no-require-imports': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/rules-of-hooks': 'warn',
      'react/no-unescaped-entities': 'warn',
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
