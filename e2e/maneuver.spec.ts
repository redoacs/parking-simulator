import { expect, test } from '@playwright/test';

for (const preset of ['parallel', 'perpendicular', 'garage'])
  test(`${preset}: validated demonstration preserves driving and switches languages`, async ({ page }) => {
    await page.goto(`/#p=${preset}`);
    await expect(page.locator('#hud')).toContainText('clearance');
    await page.evaluate(() => window.__sim!.setKey('forward', true));
    await page.waitForFunction(() => window.__sim!.snapshot().historyLength > 20);
    await page.evaluate(() => window.__sim!.setKey('forward', false));
    await expect.poll(() => page.evaluate(() => window.__sim!.snapshot().state.speed)).toBe(0);
    const before = await page.evaluate(() => window.__sim!.snapshot());
    await page.getByRole('button', { name: 'Show maneuver', exact: true }).click();
    await expect(page.locator('.maneuver-bar')).toBeVisible({ timeout: 35000 });
    await expect(page.locator('.maneuver-metrics')).toContainText('clearance ≥');
    const play = page.locator('.maneuver-bar').getByRole('button', { name: 'Play demonstration', exact: true });
    await page.evaluate(() => (document.activeElement as HTMLElement).blur());
    await page.keyboard.down('Space');
    await play.focus();
    await page.keyboard.up('Space'); // keydown came from driving, so this release must not be swallowed by the button
    await play.press('Space');
    await expect.poll(() => page.evaluate(() => window.__sim!.snapshot().maneuver!.frame)).toBeGreaterThan(10);
    await page.locator('.maneuver-bar').getByRole('button', { name: 'Pause demonstration', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__sim!.snapshot().maneuver!.playing)).toBe(false);
    const paused = await page.evaluate(() => window.__sim!.snapshot());
    expect(paused.state).toEqual(before.state);
    expect(paused.historyLength).toBe(before.historyLength);
    expect(paused.firstContactTime).toBe(before.firstContactTime);
    const hash = new URL(page.url()).hash;
    await page.getByRole('combobox', { name: 'Language / Idioma' }).selectOption('es');
    await expect(page.locator('.maneuver-panel')).toContainText('Maniobra sugerida');
    expect(new URL(page.url()).hash).toBe(hash);
    expect((await page.evaluate(() => window.__sim!.snapshot().maneuver))!.frame).toBe(paused.maneuver!.frame);
    for (let i = 0; i < 30; i++) {
      const next = page.locator('.maneuver-bar').getByRole('button', { name: 'Siguiente instrucción', exact: true });
      const progress = await page.evaluate(() => window.__sim!.snapshot().maneuver!);
      if (progress.frame === progress.frames - 1) break;
      await next.click();
    }
    await expect(page.locator('.maneuver-caption')).toContainText('Demostración terminada');
    const done = await page.evaluate(() => window.__sim!.snapshot());
    expect(done.maneuver!.state.speed).toBe(0);
    const untouched = await page.evaluate(([x, y]) => window.__sim!.readEnvelopeAt(x, y), [
      done.maneuver!.state.x,
      done.maneuver!.state.y,
    ] as const);
    expect(untouched).toBeLessThan(0.01);
    expect(done.state).toEqual(before.state);
    expect(done.historyLength).toBe(before.historyLength);
    await page.locator('.maneuver-bar').getByRole('button', { name: 'Cerrar demostración', exact: true }).click();
    await expect(page.locator('.maneuver-bar')).toBeHidden();
    expect((await page.evaluate(() => window.__sim!.snapshot())).state).toEqual(before.state);
  });

test('failed search remains a bounded result, and a scenario edit invalidates a ready route', async ({ page }) => {
  await page.goto('/#p=parallel&spotLength=5&spotWidth=2&laneWidth=2.5');
  await expect(page.locator('#hud')).toContainText('clearance');
  await page.getByRole('button', { name: 'Show maneuver', exact: true }).click();
  await expect(page.locator('.maneuver-panel [role=status]')).toContainText('No maneuver found within the search limit', {
    timeout: 35000,
  });
  await expect(page.locator('.maneuver-bar')).toBeHidden();
  await page.getByRole('combobox', { name: 'Scenario preset' }).selectOption('garage');
  await page.getByRole('button', { name: 'Show maneuver', exact: true }).click();
  await expect(page.locator('.maneuver-bar')).toBeVisible({ timeout: 35000 });
  await page.locator('label.param', { hasText: 'Include mirrors' }).locator('input').uncheck();
  await expect(page.locator('.maneuver-bar')).toBeHidden();
  expect((await page.evaluate(() => window.__sim!.snapshot())).maneuver).toBeNull();
  await expect(page.locator('#fatal')).toBeHidden();
});

test('compact Spanish playback fits above its controls and resets only the ghost', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#p=parallel');
  await expect(page.locator('#hud')).toContainText('clearance');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('combobox', { name: 'Language / Idioma' }).selectOption('es');
  await page.getByRole('button', { name: 'Mostrar maniobra', exact: true }).click();
  const bar = page.locator('.maneuver-bar');
  await expect(bar).toBeVisible({ timeout: 35000 });
  await expect(page.locator('#panel')).not.toBeInViewport();
  await expect(page.locator('#overlay .thumb')).toHaveCount(2);
  const manual = await page.evaluate(() => window.__sim!.snapshot().state);
  await bar.getByRole('button', { name: 'Siguiente instrucción', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__sim!.snapshot().maneuver!.frame)).toBeGreaterThan(0);
  await page.keyboard.press('r');
  await expect.poll(() => page.evaluate(() => window.__sim!.snapshot().maneuver!.frame)).toBe(0);
  expect(await page.evaluate(() => window.__sim!.snapshot().state)).toEqual(manual);
  const ghost = await page.evaluate(() => {
    const s = window.__sim!.snapshot().maneuver!.state;
    return window.__sim!.worldToCss(s.x, s.y);
  });
  const barBox = (await bar.boundingBox())!;
  expect(ghost.x).toBeGreaterThan(10);
  expect(ghost.x).toBeLessThan(380);
  expect(ghost.y).toBeGreaterThan(60);
  expect(ghost.y).toBeLessThan(barBox.y - 10);
  await expect(bar.getByRole('button', { name: 'Reproducir demostración', exact: true })).toBeInViewport();
  await page.setViewportSize({ width: 844, height: 390 });
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
  await page.getByRole('button', { name: 'Ajustar vista (F)', exact: true }).click();
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
  await expect(bar.getByRole('button', { name: 'Cerrar demostración', exact: true })).toBeInViewport();
  const size = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, view: innerWidth }));
  expect(size.scroll).toBe(size.view);
});

test('search remains responsive and can be cancelled before requesting another scenario', async ({ page }) => {
  await page.goto('/#p=perpendicular&bayWidth=2.3&bayDepth=4.5&aisleWidth=5');
  await expect(page.locator('#hud')).toContainText('clearance');
  await page.getByRole('button', { name: 'Show maneuver', exact: true }).click();
  await expect(page.locator('.maneuver-panel [role=status]')).toContainText('Finding and checking');
  await page.evaluate(() => window.__sim!.setKey('forward', true));
  await page.waitForFunction(() => window.__sim!.snapshot().historyLength > 10);
  await page.evaluate(() => window.__sim!.setKey('forward', false));
  await page.getByRole('button', { name: 'Cancel search', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Show maneuver', exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Scenario preset' }).selectOption('garage');
  await page.getByRole('button', { name: 'Show maneuver', exact: true }).click();
  await expect(page.locator('.maneuver-bar')).toBeVisible({ timeout: 35000 });
  const s = await page.evaluate(() => window.__sim!.snapshot());
  expect(s.presetId).toBe('garage');
  expect(s.maneuver!.state.x).toBe(s.state.x);
  expect(s.maneuver!.state.y).toBe(s.state.y);
  await expect(page.locator('#fatal')).toBeHidden();
});
