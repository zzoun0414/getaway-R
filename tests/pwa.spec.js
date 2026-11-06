const { test, expect } = require('./helpers');
test.use({ serviceWorkers: 'allow' });

test('installable: manifest, icons and an active service worker with the app shell cached', async ({ page }) => {
  await page.goto('/');
  const manifest = await page.evaluate(() => fetch('manifest.webmanifest').then(r => r.json()));
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons.map(i => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
  const active = await page.evaluate(() => navigator.serviceWorker.ready.then(r => !!r.active));
  expect(active).toBe(true);
  const cached = await page.evaluate(() => caches.open('gw-v2').then(c => c.keys()).then(ks => ks.map(k => new URL(k.url).pathname)));
  expect(cached).toEqual(expect.arrayContaining(['/js/main.js', '/css/app.css', '/index.html']));
});
