import { expect, test } from '@playwright/test';

test('boots WebGPU, drives, records clearance and envelope', async ({ page }) => {
  await page.goto('/#p=parallel');
  // Either outcome ends the wait, so a WebGPU failure surfaces its #fatal text instead of a bare timeout.
  await page.waitForFunction(() => Boolean(window.__sim) || !document.getElementById('fatal')!.hidden, null, { timeout: 20_000 });

  const fatal = page.locator('#fatal');
  expect(await fatal.textContent(), 'fatal message shown').toBe('');
  await expect(fatal).toBeHidden();

  // The HUD fills on the first frame; wait for it so the baseline is a real reading, not ''.
  await expect(page.locator('#hud')).toContainText('clearance');
  const hudBefore = await page.locator('#hud').innerText();

  const start = await page.evaluate(() => window.__sim!.snapshot());
  expect(start.clearance).not.toBeNull();
  expect(start.clearance!.distance).toBeGreaterThan(0);

  await page.evaluate(() => window.__sim!.setKey('reverse', true));
  // Poll the sim state rather than sleeping: App.frame clamps frameDt, so wall-clock time is not sim time.
  await page.waitForFunction((x0) => window.__sim!.snapshot().state.x < x0 - 1.2, start.state.x, { timeout: 15_000 });
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
  await page.waitForFunction((t0) => Math.abs(window.__sim!.snapshot().state.theta - t0) > 0.15, after.state.theta, { timeout: 15_000 });
  await page.evaluate(() => {
    window.__sim!.setKey('left', false);
    window.__sim!.setKey('reverse', false);
  });
  await page.waitForTimeout(100);
  const arced = await page.evaluate(() => window.__sim!.snapshot());
  expect(Number.isFinite(arced.clearance!.distance)).toBe(true);
  expect(arced.state.theta).not.toBeCloseTo(after.state.theta, 3);
  expect(arced.clearance!.distance).not.toBeCloseTo(after.clearance!.distance, 3);

  // The start pose lies inside the swept envelope: read back the texel under the original rear axle.
  const coverage = await page.evaluate(([x, y]) => window.__sim!.readEnvelopeAt(x, y), [start.state.x, start.state.y] as const);
  expect(coverage).toBeGreaterThan(0.5);

  // Readout text reflects the state: the label is static, so also require the text to have changed.
  await expect(page.locator('#hud')).toContainText('clearance');
  expect(await page.locator('#hud').innerText()).not.toBe(hudBefore);
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
