import { defineConfig } from '@playwright/test';

// Headless Chromium on this Linux machine only gets a working WebGPU device via SwiftShader
// (software Vulkan), and it needs all five flags: '--use-angle=vulkan' and '--use-vulkan=swiftshader'
// are required on top of the first three, otherwise the device is created but silently destroyed
// shortly after (GPU readbacks then fail: "A valid external Instance reference no longer exists").
// The Playwright MCP browser has no adapter at all.
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    launchOptions: {
      args: [
        '--enable-unsafe-webgpu',
        '--enable-features=Vulkan',
        '--ignore-gpu-blocklist',
        '--use-angle=vulkan',
        '--use-vulkan=swiftshader',
      ],
    },
  },
  webServer: {
    command: 'pnpm build && pnpm preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
