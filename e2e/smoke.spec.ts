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
  // Spec §6: the readout names what the clearance is measured against (the arc reverses into the front neighbour car).
  expect(arced.obstacleKind).toBe('car');
  await expect(page.locator('#panel .readout', { hasText: 'Against' })).toContainText('car');

  // The start pose lies inside the swept envelope: read back the texel under the original rear axle.
  const coverage = await page.evaluate(([x, y]) => window.__sim!.readEnvelopeAt(x, y), [start.state.x, start.state.y] as const);
  expect(coverage).toBeGreaterThan(0.5);

  // Readout text reflects the state: the label is static, so also require the text to have changed.
  await expect(page.locator('#hud')).toContainText('clearance');
  expect(await page.locator('#hud').innerText()).not.toBe(hudBefore);

  // Rewind pops the recorded history: the car moves back toward where it started.
  await page.evaluate(() => window.__sim!.setKey('rewind', true));
  await page.waitForFunction((n) => window.__sim!.snapshot().historyLength < n / 2, arced.historyLength, { timeout: 15_000 });
  await page.evaluate(() => window.__sim!.setKey('rewind', false));
  await page.waitForTimeout(100);
  const rewound = await page.evaluate(() => window.__sim!.snapshot());
  expect(rewound.historyLength).toBeLessThan(arced.historyLength);
  expect(rewound.state.x).toBeGreaterThan(arced.state.x);

  // Reset restores the start pose and clears the run.
  await page.evaluate(() => {
    window.__sim!.setKey('reset', true);
    window.__sim!.setKey('reset', false);
  });
  await page.waitForTimeout(200);
  const reset = await page.evaluate(() => window.__sim!.snapshot());
  expect(reset.historyLength).toBe(0);
  expect(reset.state.x).toBeCloseTo(start.state.x, 3);
  // simTime counts idle steps too, so 200 ms after the reset it reads ~0.2 s, not 0: assert the clock restarted.
  expect(reset.simTime).toBeLessThan(1);
  expect(reset.simTime).toBeLessThan(arced.simTime);
  expect(reset.firstContactTime).toBeNull();
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

test('panel: cross-param corrections are shown, empty input keeps its value, zoom buttons zoom', async ({ page }) => {
  await page.goto('/#p=garage');
  await page.waitForFunction(() => Boolean(window.__sim) || !document.getElementById('fatal')!.hidden, null, { timeout: 20_000 });
  await expect(page.locator('#fatal')).toBeHidden();
  const field = (label: string) => page.locator('label.param', { hasText: label }).locator('input');

  // Door 3.0 m cannot fit a 2.6 m interior: the door field, the built scene and the hash all show 2.6.
  await field('Door opening').fill('3');
  await field('Door opening').press('Enter');
  await field('Interior width').fill('2.6');
  await field('Interior width').press('Enter');
  await expect(field('Door opening')).toHaveValue('2.6');
  expect((await page.evaluate(() => window.__sim!.snapshot().params)).doorWidth).toBe(2.6);
  expect(page.url()).toContain('doorWidth=2.6');

  // Clearing a field is not an edit: it must not commit the minimum (5.0) or restart the run.
  await page.evaluate(() => window.__sim!.setKey('forward', true));
  await page.waitForFunction(() => window.__sim!.snapshot().historyLength > 30, null, { timeout: 15_000 });
  await page.evaluate(() => window.__sim!.setKey('forward', false));
  await field('Interior depth').fill('');
  await field('Interior depth').press('Enter');
  await expect(field('Interior depth')).toHaveValue('5.5');
  const kept = await page.evaluate(() => window.__sim!.snapshot());
  expect(kept.params.interiorDepth).toBe(5.5);
  expect(kept.historyLength).toBeGreaterThan(30);

  const stage = page.locator('#gpu');
  const before = await stage.screenshot();
  await page.getByRole('button', { name: 'Zoom +' }).click();
  await page.waitForTimeout(200);
  expect((await stage.screenshot()).equals(before)).toBe(false);
  await page.getByRole('button', { name: 'Fit view' }).click();
  await page.waitForTimeout(200);
  expect((await stage.screenshot()).equals(before)).toBe(true);
});
