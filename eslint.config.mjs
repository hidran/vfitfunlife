import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';

const eslintConfig = [
  {
    ignores: [
      '**/.next/**',
      '**/out/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/android/**',
      '**/ios/**',
      '**/.claude/**',
      '**/.gemini/**',
      '**/.opencode/**',
      '**/.agent/**',
      '**/.agents/**',
      '**/.junie/**',
      '**/.kilocode/**',
      'functions/**',
      'src/dataconnect-generated/**',
      'next-env.d.ts',
      '**/*.d.ts',
    ],
  },
  ...nextCoreWebVitals,
];

export default eslintConfig;
