import { defineConfig } from '@playwright/test';

// Headless Chromium's default software GL is enough for WebGL2: no launch flags are needed.

// Never reuse a server that is already listening: it may be another worktree's build, and the run would go green for
// the wrong code. A busy port now fails loudly. To run two suites at once, give each a port: E2E_PORT=4174 pnpm test:e2e
const port = Number(process.env.E2E_PORT) || 4173;

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${String(port)}`,
  },
  webServer: {
    command: `pnpm build && pnpm preview --port ${String(port)} --strictPort`,
    url: `http://localhost:${String(port)}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    // The phone gesture suite uses Chromium's CDP touch/rotation emulation. Shared smoke tests run on all engines.
    { name: 'firefox', testMatch: '**/smoke.spec.ts', use: { browserName: 'firefox' } },
    { name: 'webkit', testMatch: '**/smoke.spec.ts', use: { browserName: 'webkit' } },
  ],
});
