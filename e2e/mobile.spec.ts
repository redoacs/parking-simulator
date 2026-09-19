import { expect, test, type CDPSession, type Locator, type Page } from '@playwright/test';

const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };

async function boot(page: Page): Promise<void> {
  await page.goto('/#p=parallel');
  await page.waitForFunction(() => Boolean(window.__sim) || !document.getElementById('fatal')!.hidden, null, { timeout: 20_000 });
  await expect(page.locator('#fatal')).toBeHidden();
}

async function centre(target: Locator): Promise<{ x: number; y: number }> {
  const box = (await target.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Real multi-touch through the browser's input pipeline, so its touch-to-pointer conversion is part of the test. */
async function touch(
  cdp: CDPSession,
  type: 'touchStart' | 'touchMove' | 'touchEnd',
  points: { x: number; y: number; id: number }[],
): Promise<void> {
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
}

test.describe('phone layout', () => {
  test.use(phone);

  test('shows the thumb controls, keeps the settings in a sheet', async ({ page }) => {
    await boot(page);
    await expect(page.getByRole('button', { name: 'Steer left' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reverse', exact: true })).toBeVisible();
    const panel = page.locator('#panel');
    await expect(panel).not.toBeInViewport();

    await page.getByRole('button', { name: 'Settings' }).tap();
    await expect(panel).toBeInViewport();
    await expect(page.locator('#panel select')).toBeVisible();
    // The sidebar's own drive pad would duplicate the thumb controls.
    await expect(page.locator('#panel .pad.wide-only')).toBeHidden();

    // A press on the scene closes the sheet. Tap to the right of it, on the canvas.
    await page.touchscreen.tap(380, 420);
    await expect(panel).not.toBeInViewport();
  });

  test('two thumbs at once: reversing while steering moves and turns the car', async ({ page }) => {
    await boot(page);
    const cdp = await page.context().newCDPSession(page);
    const start = await page.evaluate(() => window.__sim!.snapshot().state);
    const reverse = { ...(await centre(page.getByRole('button', { name: 'Reverse', exact: true }))), id: 1 };
    const left = { ...(await centre(page.getByRole('button', { name: 'Steer left' }))), id: 2 };

    await touch(cdp, 'touchStart', [reverse]);
    await touch(cdp, 'touchStart', [reverse, left]); // the second thumb lands while the first is still down
    await page.waitForFunction((t0) => Math.abs(window.__sim!.snapshot().state.theta - t0) > 0.1, start.theta, { timeout: 15_000 });
    const moving = await page.evaluate(() => window.__sim!.snapshot().state);
    expect(moving.y).toBeLessThan(start.y - 0.3); // reversed (the car starts pointing up the screen)
    expect(moving.steer).toBeGreaterThan(0.1); // and steered, at the same time

    await touch(cdp, 'touchEnd', []);
    await page.waitForTimeout(150);
    const a = await page.evaluate(() => window.__sim!.snapshot().state);
    await page.waitForTimeout(250);
    const b = await page.evaluate(() => window.__sim!.snapshot().state);
    expect(b.speed).toBe(0);
    expect(b.y).toBe(a.y); // released means stopped
  });

  test('a two-finger spread zooms in about the fingers; a drive button never pans the scene', async ({ page }) => {
    await boot(page);
    const cdp = await page.context().newCDPSession(page);
    // On-screen distance between two fixed world points: a direct reading of the zoom.
    const span = (): Promise<number> =>
      page.evaluate(() => {
        const p = window.__sim!.worldToCss(0, 0);
        const q = window.__sim!.worldToCss(0, 1);
        return Math.hypot(q.x - p.x, q.y - p.y);
      });
    const origin = (): Promise<{ x: number; y: number }> => page.evaluate(() => window.__sim!.worldToCss(0, 0));

    const before = await span();
    const a = { x: 170, y: 300, id: 1 };
    const b = { x: 220, y: 300, id: 2 };
    await touch(cdp, 'touchStart', [a, b]);
    for (let i = 1; i <= 8; i++)
      await touch(cdp, 'touchMove', [
        { ...a, x: a.x - i * 10 },
        { ...b, x: b.x + i * 10 },
      ]);
    await touch(cdp, 'touchEnd', []);
    const after = await span();
    // Finger distance went 50 -> 210 px, so the zoom should be about 4.2x.
    expect(after / before).toBeGreaterThan(3.8);
    expect(after / before).toBeLessThan(4.6);

    const held = await origin();
    const button = { ...(await centre(page.getByRole('button', { name: 'Steer right' }))), id: 3 };
    await touch(cdp, 'touchStart', [button]);
    await touch(cdp, 'touchMove', [{ ...button, x: button.x + 40, y: button.y - 60 }]);
    await touch(cdp, 'touchEnd', []);
    const stillThere = await origin();
    expect(stillThere.x).toBeCloseTo(held.x, 3);
    expect(stillThere.y).toBeCloseTo(held.y, 3);
  });

  test('the scene is fitted clear of the thumb controls', async ({ page }) => {
    await boot(page);
    const controlsTop = Math.min(
      (await page.locator('#overlay .thumb.left').boundingBox())!.y,
      (await page.locator('#overlay .thumb.right').boundingBox())!.y,
    );
    // The rear neighbour's tail is 4.5 m behind the spot, which starts at y = 0: the lowest car on screen in this preset.
    const lowest = await page.evaluate(() => window.__sim!.worldToCss(window.__sim!.snapshot().state.x, -4.5).y);
    expect(lowest).toBeLessThan(controlsTop);
  });
});

test('desktop keeps the sidebar and shows no thumb controls', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await boot(page);
  await expect(page.locator('#panel')).toBeInViewport();
  await expect(page.locator('#panel .pad.wide-only')).toBeVisible();
  await expect(page.locator('#overlay')).toBeHidden();
});
