const { test, expect, signUp, friendSays } = require('./helpers');

test('phone layout: one editor, menu behind ☰, tapping the tab hides the chat', async ({ page }) => {
  await signUp(page);
  await friendSays(page, 'room1', 'on my phone');
  await expect(page.locator('.sidebar')).toBeHidden();
  await expect(page.locator('#hamb')).toBeVisible();
  await page.locator('#hamb').click();
  await expect(page.locator('#dropdown')).toContainText('Read Together');
  await page.locator('#hamb').click();
  await expect(page.locator('.ln.msg', { hasText: 'on my phone' })).toBeVisible();
  await page.locator('.tab.on').click();
  await expect(page.locator('.ln.msg')).toHaveCount(0);
});
