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
    await expect(page.getByRole('combobox', { name: 'Scenario preset' })).toBeVisible();
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
    // The world point under the fingers' midpoint (195, 300) must still be there afterwards: a zoom by the right ratio
    // about the wrong anchor would move it.
    const anchorWorld = await page.evaluate(() => {
      const o = window.__sim!.worldToCss(0, 0);
      const x1 = window.__sim!.worldToCss(1, 0);
      const y1 = window.__sim!.worldToCss(0, 1);
      return { x: (195 - o.x) / (x1.x - o.x), y: (300 - o.y) / (y1.y - o.y) };
    });
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
    const anchorNow = await page.evaluate(([x, y]) => window.__sim!.worldToCss(x, y), [anchorWorld.x, anchorWorld.y] as const);
    expect(anchorNow.x).toBeCloseTo(195, 0);
    expect(anchorNow.y).toBeCloseTo(300, 0);

    const held = await origin();
    const button = { ...(await centre(page.getByRole('button', { name: 'Steer right' }))), id: 3 };
    await touch(cdp, 'touchStart', [button]);
    await touch(cdp, 'touchMove', [{ ...button, x: button.x + 40, y: button.y - 60 }]);
    await touch(cdp, 'touchEnd', []);
    const stillThere = await origin();
    expect(stillThere.x).toBeCloseTo(held.x, 3);
    expect(stillThere.y).toBeCloseTo(held.y, 3);
  });

  test('a second thumb can tap Zoom and the menu while the first holds a steering button', async ({ page }) => {
    await boot(page);
    const cdp = await page.context().newCDPSession(page);
    const span = (): Promise<number> =>
      page.evaluate(() => {
        const p = window.__sim!.worldToCss(0, 0);
        const q = window.__sim!.worldToCss(0, 1);
        return Math.hypot(q.x - p.x, q.y - p.y);
      });
    const before = await span();
    const hold = { ...(await centre(page.getByRole('button', { name: 'Steer left' }))), id: 1 };
    const zoomIn = { ...(await centre(page.getByRole('button', { name: 'Zoom in' }))), id: 2 };
    await touch(cdp, 'touchStart', [hold]);
    // Browsers synthesise no `click` for this second finger, so a click-only button would ignore it.
    await touch(cdp, 'touchStart', [hold, zoomIn]);
    await touch(cdp, 'touchEnd', [hold]);
    expect((await span()) / before).toBeCloseTo(1.25, 2);

    const menu = { ...(await centre(page.getByRole('button', { name: 'Settings' }))), id: 3 };
    await touch(cdp, 'touchStart', [hold, menu]);
    await touch(cdp, 'touchEnd', [hold]);
    await expect(page.locator('#panel')).toBeInViewport();
    await expect(page.getByRole('button', { name: 'Settings' })).toHaveAttribute('aria-expanded', 'true');
    // Partly covered by the sheet, the thumb controls must not stay live underneath it.
    await expect(page.getByRole('button', { name: 'Forward', exact: true })).toBeHidden();
    await touch(cdp, 'touchEnd', []);

    await page.keyboard.press('Escape');
    await expect(page.locator('#panel')).not.toBeInViewport();
    await expect(page.getByRole('button', { name: 'Settings' })).toHaveAttribute('aria-expanded', 'false');
  });

  test('turning the phone re-fits the scene between the thumb columns', async ({ page }) => {
    await boot(page);
    // A real rotation: the screen's orientation changes, not just the viewport's size.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 844,
      height: 390,
      deviceScaleFactor: 3,
      mobile: true,
      screenOrientation: { type: 'landscapePrimary', angle: 90 },
    });
    await page.waitForTimeout(700);
    const leftEdge = (await page.locator('#overlay .thumb.left').boundingBox())!;
    const rightEdge = (await page.locator('#overlay .thumb.right').boundingBox())!;
    // Default parallel scene, after its quarter turn: bounds run from y = -9 to y = 19.2 (the street frame's x range:
    // 4.5 m neighbours, 3 m of kerb beyond each, 1.5 m padding, 4 m extra ahead of the car).
    const pts = await page.evaluate(() => {
      const s = window.__sim!.snapshot().state;
      return {
        top: window.__sim!.worldToCss(s.x, 19.2),
        bottom: window.__sim!.worldToCss(s.x, -9),
        car: window.__sim!.worldToCss(s.x, s.y),
      };
    });
    // The whole scene is on screen: a stale portrait scale would overflow top and bottom...
    expect(pts.top.y).toBeGreaterThanOrEqual(0);
    expect(pts.bottom.y).toBeLessThanOrEqual(390);
    // ...and it uses the height between the columns (fit leaves 10 %), not a strip above the controls.
    expect(pts.bottom.y - pts.top.y).toBeGreaterThan(0.8 * 390);
    expect(pts.car.x).toBeGreaterThan(leftEdge.x + leftEdge.width);
    expect(pts.car.x).toBeLessThan(rightEdge.x);
  });

  test('resizes that are not a rotation keep the zoom: an on-screen keyboard, a browser bar', async ({ page }) => {
    await boot(page);
    const span = (): Promise<number> =>
      page.evaluate(() => {
        const p = window.__sim!.worldToCss(0, 0);
        const q = window.__sim!.worldToCss(0, 1);
        return Math.hypot(q.x - p.x, q.y - p.y);
      });
    await page.getByRole('button', { name: 'Zoom in' }).tap();
    await page.getByRole('button', { name: 'Zoom in' }).tap();
    const zoomed = await span();
    // Android resizes the layout viewport for the keyboard; at 390 wide that makes the canvas wider than tall, which an
    // aspect test would mistake for a rotation, twice. The screen itself stays portrait, so say so explicitly: Playwright's
    // own setViewportSize would derive a landscape screen from these numbers, which no keyboard does.
    const cdp = await page.context().newCDPSession(page);
    const resize = async (height: number): Promise<void> => {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: 390,
        height,
        deviceScaleFactor: 3,
        mobile: true,
        screenOrientation: { type: 'portraitPrimary', angle: 0 },
      });
      await page.waitForTimeout(500);
    };
    await resize(360);
    expect(await page.evaluate(() => document.getElementById('gpu')!.clientHeight)).toBe(360); // the resize really happened
    expect(await span()).toBeCloseTo(zoomed, 6);
    await resize(780);
    expect(await span()).toBeCloseTo(zoomed, 6);
  });

  test('opening the sheet by tap moves focus into it', async ({ page }) => {
    await boot(page);
    await page.getByRole('button', { name: 'Settings' }).tap();
    await expect(page.locator('#panel')).toBeInViewport();
    // The browser focuses a tapped button after our pointerdown; left alone, that pulls focus back out of the sheet and
    // the next Tab leaves the page.
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('panel');
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('SELECT');
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

  test('a tap on a vehicle dimension shows its source note', async ({ page }) => {
    await boot(page);
    await page.getByRole('button', { name: 'Settings' }).tap();
    await expect(page.locator('#panel')).toBeInViewport();
    const row = page.locator('#panel details.cited', { has: page.locator('summary', { hasText: 'Turning circle' }) });
    const summary = row.locator('summary');
    await summary.scrollIntoViewIfNeeded();
    await summary.tap();
    await expect(row.locator('.note')).toHaveText(/applicability to MX 2025 not confirmed/);
    await expect(row.locator('a.source')).toBeVisible();
  });

  // iOS long-press selection and its loupe cannot be reproduced here: this pins the rule, the phone is the real check.
  test('text selection is off across the stage, except for fatal details', async ({ page }) => {
    await boot(page);
    const userSelect = (selector: string) =>
      page
        .locator(selector)
        .first()
        .evaluate((el) => getComputedStyle(el).userSelect);
    for (const selector of ['#stage', '#hud', '#overlay button']) expect(await userSelect(selector), selector).toBe('none');
    expect(await userSelect('#fatal')).toBe('text');
  });
});

test('desktop keeps the sidebar and shows no thumb controls', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await boot(page);
  await expect(page.locator('#panel')).toBeInViewport();
  await expect(page.locator('#panel .pad.wide-only')).toBeVisible();
  await expect(page.locator('#overlay')).toBeHidden();
});
