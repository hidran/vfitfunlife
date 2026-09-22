import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './tests/setup.ts',
    // Spread the defaults rather than replacing them — they carry `**/node_modules/**`, and
    // dropping it makes vitest collect the test files shipped inside functions/node_modules.
    //
    // `e2e/` holds Playwright specs. They import from '@playwright/test', which throws when
    // a runner other than Playwright's imports it, so collecting them here only ever
    // produced failures that said nothing about the code. They run via
    // `npm run test:e2e` (legacy specs) and `npm run e2e:journey` (the journey suite).
    exclude: [...configDefaults.exclude, 'e2e/**'],
    coverage: {
      reporter: ['text', 'html', 'json'],
      exclude: [
        'node_modules/',
        'tests/',
        '*.config.ts',
        'out/',
        '.next/',
      ],
    },
  },
});
