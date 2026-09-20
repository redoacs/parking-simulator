import { DEVICE_LOSS_KEY } from '../src/ui/deviceLoss';
import { expect, test, type Page } from '@playwright/test';

const language = (page: Page) => page.getByRole('combobox', { name: 'Language / Idioma' });
const ready = async (page: Page): Promise<void> => {
  await page.waitForFunction(() => Boolean(window.__sim) || !document.getElementById('fatal')!.hidden);
  await expect(page.locator('#fatal')).toBeHidden();
};
const settle = async (page: Page): Promise<void> => {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
};

test('live language switch preserves the run, camera, inputs and scenario link', async ({ page }) => {
  await page.goto('/#p=garage');
  await ready(page);
  await page.getByLabel('Include mirrors').uncheck();
  await page.getByLabel('Time scale').fill('0.5');
  await page.getByRole('button', { name: 'Zoom +' }).click();
  await page.evaluate(() => window.__sim!.setKey('reverse', true));
  await page.waitForFunction(() => window.__sim!.snapshot().historyLength > 30);
  await page.evaluate(() => window.__sim!.setKey('reverse', false));
  await settle(page);
  const forward = await page.getByRole('button', { name: 'Forward', exact: true }).elementHandle();
  const input = await page.getByLabel('Interior depth').elementHandle();
  const before = await page.evaluate(() => ({
    state: window.__sim!.snapshot(),
    camera: [window.__sim!.worldToCss(0, 0), window.__sim!.worldToCss(1, 1)],
    hash: location.hash,
  }));
  await language(page).selectOption('es');
  await expect(page).toHaveTitle('Simulador de estacionamiento');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es-MX');
  await expect(page.getByRole('combobox', { name: 'Tipo de escenario' })).toBeVisible();
  await expect(page.getByLabel('Escala de tiempo')).toHaveValue('0.5');
  await expect(page.getByLabel('Incluir espejos')).not.toBeChecked();
  await expect(page.locator('#hud')).toContainText('distancia');
  const after = await page.evaluate(() => ({
    state: window.__sim!.snapshot(),
    camera: [window.__sim!.worldToCss(0, 0), window.__sim!.worldToCss(1, 1)],
    hash: location.hash,
  }));
  expect(after.state.state).toEqual(before.state.state);
  expect(after.state.historyLength).toBe(before.state.historyLength);
  expect(after.state.params).toEqual(before.state.params);
  expect(after.state.timeScale).toBe(before.state.timeScale);
  expect(after.state.mirrors).toBe(false);
  expect(after.state.simTime).toBeGreaterThanOrEqual(before.state.simTime);
  expect(after.camera).toEqual(before.camera);
  expect(after.hash).toBe(before.hash);
  expect(await forward.evaluate((node) => node.isConnected && node.getAttribute('aria-label') === 'Avanzar')).toBe(true);
  expect(await input.evaluate((node) => node.isConnected)).toBe(true);

  const advance = page.getByRole('button', { name: 'Avanzar', exact: true });
  await advance.focus();
  await page.keyboard.down('Enter');
  await expect.poll(() => page.evaluate(() => window.__sim!.snapshot().state.speed)).toBe(2);
  await page.keyboard.up('Enter');
  await expect.poll(() => page.evaluate(() => window.__sim!.snapshot().state.speed)).toBe(0);
  await page.locator('#gpu').click();
  await page.keyboard.down('w');
  await expect.poll(() => page.evaluate(() => window.__sim!.snapshot().state.speed)).toBe(2);
  await page.keyboard.up('w');
  await language(page).selectOption('en');
  await expect(page.getByLabel('Interior depth')).toHaveValue('5.5');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('fatal summaries switch language and retain literal diagnostic text', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  const detail = '<b>"field"</b> & diagnostic';
  await page.evaluate((message) => window.dispatchEvent(new ErrorEvent('error', { message })), detail);
  const fatal = page.locator('#fatal');
  await expect(fatal).toContainText(`Unexpected error. Technical details: ${detail}`);
  await language(page).selectOption('es');
  await expect(fatal).toContainText(`Error inesperado. Detalles técnicos: ${detail}`);
  await expect(fatal.locator('b')).toHaveCount(0);
});

test('a repeated GPU-loss notification keeps a translated fatal message through a language switch', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  await language(page).selectOption('es');
  // Exercise the event handler and no-reload policy; this is not a physical GPU failure.
  await page.evaluate((key) => {
    sessionStorage.setItem(key, String(Date.now()));
    document.getElementById('gpu')!.dispatchEvent(new Event('webglcontextlost'));
  }, DEVICE_LOSS_KEY);
  await expect(page.locator('#fatal')).toContainText('Se perdió la conexión con la GPU');
  await expect(page.locator('#fatal')).not.toContainText('WebGL context lost');
  await language(page).selectOption('en');
  await expect(page.locator('#fatal')).toContainText('The GPU was lost');
  await page.evaluate(() => window.dispatchEvent(new ErrorEvent('error', { message: 'later fallout' })));
  await expect(page.locator('#fatal')).not.toContainText('later fallout');
});

test.describe('Spanish browser preference', () => {
  test.use({ locale: 'es-MX' });

  test('localizes scenarios, numeric edits, source warnings and held controls', async ({ page }) => {
    await page.goto('/');
    await ready(page);
    await expect(page).toHaveTitle('Simulador de estacionamiento');
    await expect(language(page)).toHaveValue('es');
    const scenario = page.getByRole('combobox', { name: 'Tipo de escenario' });
    await expect(scenario.locator('option')).toHaveText([
      'En paralelo entre dos autos',
      'Cajón perpendicular',
      'Cochera individual con acceso',
    ]);
    await expect(page.getByLabel('Largo del espacio')).toHaveValue('6.2');
    await scenario.selectOption('perpendicular');
    await expect(page.getByLabel('Ancho del cajón')).toHaveValue('2.5');
    await scenario.selectOption('garage');
    await page.getByLabel('Ancho de la entrada').fill('3');
    await page.getByLabel('Ancho de la entrada').press('Enter');
    await page.getByLabel('Ancho interior').fill('2.6');
    await page.getByLabel('Ancho interior').press('Enter');
    await expect(page.getByLabel('Ancho de la entrada')).toHaveValue('2.6');
    expect(page.url()).toContain('doorWidth=2.6');
    expect((await page.evaluate(() => window.__sim!.snapshot().params)).doorWidth).toBe(2.6);
    for (const name of ['Vía delantera', 'Vía trasera', 'Diámetro de giro']) {
      const row = page.locator('#panel .readout', { hasText: name });
      await expect(row.locator('.unverified')).toHaveText('sin verificar');
      await expect(row.locator('a.source')).toHaveAttribute('title', /no se ha confirmado su aplicación a MX 2025/);
    }
    await expect(page.locator('#panel .unverified')).toHaveCount(9);
    const reverse = page.getByRole('button', { name: 'Reversa', exact: true });
    await reverse.focus();
    await page.keyboard.down('Enter');
    await expect.poll(() => page.evaluate(() => window.__sim!.snapshot().state.speed)).toBe(-2);
    await page.keyboard.up('Enter');
    await expect.poll(() => page.evaluate(() => window.__sim!.snapshot().state.speed)).toBe(0);
  });

  test('remembers explicit choices across reloads ahead of browser preference', async ({ page }) => {
    await page.goto('/');
    await ready(page);
    await expect(language(page)).toHaveValue('es');
    await language(page).selectOption('en');
    await page.reload();
    await ready(page);
    await expect(language(page)).toHaveValue('en');
    await expect(page).toHaveTitle('Parking Simulator');
    await language(page).selectOption('es');
    await page.reload();
    await ready(page);
    await expect(language(page)).toHaveValue('es');
    await expect(page).toHaveTitle('Simulador de estacionamiento');
  });

  test('uses the single browser language and keeps switching usable with denied storage', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'languages', { value: [] });
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new DOMException('denied', 'SecurityError');
        },
      });
    });
    await page.goto('/');
    await ready(page);
    await expect(language(page)).toHaveValue('es');
    await language(page).selectOption('en');
    await expect(page).toHaveTitle('Parking Simulator');
    await expect(page.locator('#fatal')).toBeHidden();
    await page.reload();
    await ready(page);
    await expect(language(page)).toHaveValue('es');
  });

  test('explains missing WebGL2 in Spanish before the simulator starts', async ({ page }) => {
    await page.addInitScript(() => {
      const real = Reflect.get(HTMLCanvasElement.prototype, 'getContext') as (this: HTMLCanvasElement, ...args: unknown[]) => unknown;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: unknown[]) {
        return args[0] === 'webgl2' ? null : real.apply(this, args);
      } as typeof HTMLCanvasElement.prototype.getContext;
    });
    await page.goto('/');
    await expect(page.locator('#fatal')).toBeVisible();
    await expect(page.locator('#fatal')).toContainText('Se requiere un navegador con WebGL2');
    await expect(page.locator('html')).toHaveAttribute('lang', 'es-MX');
    expect(await page.evaluate(() => Boolean(window.__sim))).toBe(false);
  });

  test('Spanish contact readouts and settings fit a narrow screen', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/#p=garage');
    await ready(page);
    // Same body-inside/mirror-contact fixture as the shared smoke suite; requires the snapshot state alias.
    await page.evaluate(() => Object.assign(window.__sim!.snapshot().state, { x: 0.94, y: 1.5, theta: Math.PI / 2, steer: 0, speed: 0 }));
    await expect(page.locator('#hud .band-bad').filter({ hasText: 'ESTACIONADO · CONTACTO' })).toBeVisible();
    await page.getByRole('button', { name: 'Ajustes' }).click();
    await expect(page.locator('#panel')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ajustes' })).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#panel .readout', { hasText: /^Estacionado/ })).toContainText('orientación');
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.locator('#panel').evaluate((el) => el.scrollWidth <= el.clientWidth), `panel at ${width}px`).toBe(true);
    }
    await language(page).selectOption('en');
    await expect(page.getByRole('button', { name: 'Settings' })).toHaveAttribute('aria-expanded', 'true');
    await language(page).selectOption('es');
    await expect(page.getByRole('combobox', { name: 'Tipo de escenario' })).toBeVisible();
    await page.getByRole('button', { name: 'Ajustes' }).click();
    await expect(page.getByRole('button', { name: 'Reversa', exact: true })).toBeVisible();
    const overlap = await page.evaluate(() => {
      const hud = document.getElementById('hud')!.getBoundingClientRect();
      const menu = document.querySelector('#overlay .menu')!.getBoundingClientRect();
      return hud.left < menu.right && hud.right > menu.left && hud.top < menu.bottom && hud.bottom > menu.top;
    });
    expect(overlap, 'contact readout must leave the menu button clear at 320px').toBe(false);
  });
});
