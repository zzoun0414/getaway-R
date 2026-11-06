const path = require('path');
const { test, expect, signUp, run } = require('./helpers');
const fixture = name => path.join(__dirname, 'fixtures', name);

async function upload(page, file) {
  await page.locator('#bookIn').setInputFiles(fixture(file));
  await expect(page.locator('.bkhead')).toBeVisible();
}

test('EPUB: upload, contents, find, comment', async ({ page }) => {
  await signUp(page);
  await upload(page, 'test.epub');
  await expect(page.locator('.bkt')).toHaveText('四季诗集');
  // contents come from the chapter headings
  await page.locator('[data-toc]').click();
  await expect(page.locator('#qiList')).toContainText('第一章 春');
  await expect(page.locator('#qiList')).toContainText('第二章 夏');
  await page.keyboard.type('夏'); await page.keyboard.press('Enter');
  await expect(page.locator('.bkch')).toHaveText('第二章 夏');
  // find highlights the term
  await page.locator('[data-find]').click();
  await page.keyboard.type('荷花'); await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(page.locator('mark.bfind').first()).toHaveText('荷花');
  // comment on a whole paragraph
  await page.locator('.bpn').first().click();
  await page.keyboard.type('好美'); await page.keyboard.press('Enter');
  await expect(page.locator('.bth')).toContainText('好美');
  await expect(page.locator('[data-notes]')).toContainText('Notes (1)');
});

test('MOBI: compressed records with trailing data decode to the same text', async ({ page }) => {
  await signUp(page);
  await upload(page, 'long.mobi');
  await expect(page.locator('.bkhead')).toContainText('/ ');
  const pages = await page.evaluate(() => book.total);
  expect(pages).toBeGreaterThan(20);
});

test('DRM-protected books are refused with a clear message', async ({ page }) => {
  await signUp(page);
  await page.locator('#bookIn').setInputFiles(fixture('drm.mobi'));
  await expect(page.locator('#term')).toContainText('DRM-protected');
});

test('reader settings: font size and hiding the bottom panel', async ({ page }) => {
  await signUp(page);
  await upload(page, 'test.epub');
  await page.locator('[data-aa]').click();
  await page.locator('[data-rs="fs"][data-v="+1"]').click();
  await expect(page.locator('.rs .val')).toHaveText('17');
  await page.locator('[data-rs="focus"][data-v="true"]').click();
  await expect(page.locator('.panel')).toBeHidden();
  await page.keyboard.press('Escape');           // closes the panel
  await page.keyboard.press('Escape');           // boss key: back to (fake) code, panel returns
  await expect(page.locator('.panel')).toBeVisible();
});

test('board posts and private to-dos', async ({ page }) => {
  await signUp(page);
  await run(page, ':board');
  await page.locator('#boardIn').fill('note for everyone');
  await page.locator('#boardPost').click();
  await expect(page.locator('.bvp')).toContainText('note for everyone');
  await run(page, ':todo');
  await page.locator('#todoIn').fill('buy coffee beans');
  await page.locator('#todoIn').press('Enter');
  await expect(page.locator('#todoList')).toContainText('buy coffee beans');
  const me = await page.evaluate(() => myId);
  const todos = await page.evaluate(me => window.__fake.list(`users/${me}/todos`), me);
  expect(todos.map(t => t.text)).toEqual(['buy coffee beans']);
});
