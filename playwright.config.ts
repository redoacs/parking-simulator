import { defineConfig } from '@playwright/test';

// Headless Chromium's default software GL is enough for WebGL2: no launch flags are needed.

// Two worktrees running e2e at once would otherwise share a port, and `reuseExistingServer` would let one silently
// test the other's build. Give each its own: E2E_PORT=4174 pnpm test:e2e
const port = Number(process.env.E2E_PORT ?? 4173);

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
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
