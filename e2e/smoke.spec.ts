import { expect, test } from '@playwright/test';

test('boots WebGPU, drives, records clearance and envelope', async ({ page }) => {
  await page.goto('/#p=parallel');
  await page.waitForFunction(() => Boolean(window.__sim), null, { timeout: 20_000 });

  const fatal = page.locator('#fatal');
  expect(await fatal.textContent(), 'fatal message shown').toBe('');
  await expect(fatal).toBeHidden();

  const start = await page.evaluate(() => window.__sim!.snapshot());
  expect(start.clearance).not.toBeNull();
  expect(start.clearance!.distance).toBeGreaterThan(0);

  await page.evaluate(() => window.__sim!.setKey('reverse', true));
  await page.waitForTimeout(1000);
  await page.evaluate(() => window.__sim!.setKey('reverse', false));
  await page.waitForTimeout(100);

  const after = await page.evaluate(() => window.__sim!.snapshot());
  expect(after.state.x).toBeLessThan(start.state.x - 1.0);
  expect(after.historyLength).toBeGreaterThan(60);
  expect(Number.isFinite(after.clearance!.distance)).toBe(true);

  // A straight reverse in this preset slides the mirror along the neighbour's flat edge, so the
  // clearance can legitimately stay put (Task 13 measurement). An arc toward the kerb must change it.
  await page.evaluate(() => {
    window.__sim!.setKey('left', true);
    window.__sim!.setKey('reverse', true);
  });
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    window.__sim!.setKey('left', false);
    window.__sim!.setKey('reverse', false);
  });
  await page.waitForTimeout(100);
  const arced = await page.evaluate(() => window.__sim!.snapshot());
  expect(arced.state.theta).not.toBeCloseTo(after.state.theta, 3);
  expect(arced.clearance!.distance).not.toBeCloseTo(after.clearance!.distance, 3);

  // The start pose lies inside the swept envelope: read back the texel under the original rear axle.
  const coverage = await page.evaluate(([x, y]) => window.__sim!.readEnvelopeAt(x, y), [start.state.x, start.state.y] as const);
  expect(coverage).toBeGreaterThan(0.5);

  // Readout text reflects the state.
  await expect(page.locator('#hud')).toContainText('clearance');
});

test('shows a message instead of a blank page without WebGPU', async ({ browser }) => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true });
  });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.locator('#fatal')).toBeVisible();
  await expect(page.locator('#fatal')).toContainText('WebGPU');
  await context.close();
});
