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
    //
    // `.claude/**` excludes leftover agent worktrees (`.claude/worktrees/*`), which are full
    // checkouts of this repo and would otherwise have their own `src/**/*.test.ts` collected
    // a second time by whichever worktree (or the main checkout) runs the suite.
    exclude: [...configDefaults.exclude, 'e2e/**', '.claude/**'],
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
