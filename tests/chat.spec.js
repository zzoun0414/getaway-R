const { test, expect, signUp, roomId, friendSays, run } = require('./helpers');

test('sign up, join a room and send a message', async ({ page }) => {
  await signUp(page);
  await run(page, 'hello there');
  await expect(page.locator('.ln.msg.mine')).toContainText('TODO(Suu');
  await expect(page.locator('.ln.msg.mine')).toContainText('hello there');
  const id = await roomId(page, 'room1');
  const stored = await page.evaluate(id => window.__fake.list(`rooms/${id}/msgs`), id);
  expect(stored).toHaveLength(1);
  expect(stored[0]).toMatchObject({ name: 'Suu', text: 'hello there' });
});

test('a name is taken once; wrong password is rejected; the right one signs in', async ({ page }) => {
  await signUp(page, { name: 'Suu', password: 'secret1' });
  await page.evaluate(() => { window.__fake.user = null; });
  await page.reload();
  await expect(page.locator('#qiList')).toContainText('Suu');
  await page.keyboard.press('Enter');                       // pick remembered "Suu"
  await page.keyboard.type('wrongpw'); await page.keyboard.press('Enter');
  await expect(page.locator('#qiTitle')).toHaveText(/Wrong account name or password/);
  await page.keyboard.press('Enter');
  await page.keyboard.type('secret1'); await page.keyboard.press('Enter');
  await expect(page.locator('#who')).toHaveText('Suu@mbp');
});

test('friend messages show in their colour; the boss key hides every chat line', async ({ page }) => {
  await signUp(page);
  await friendSays(page, 'room1', 'lunch?');
  await expect(page.locator('.ln.msg', { hasText: 'lunch?' })).toContainText('NOTE(mika');
  await page.locator('.bkb, #editor').first().click({ position: { x: 5, y: 5 } }).catch(() => {});
  await page.keyboard.press('Escape');
  await expect(page.locator('.ln.msg')).toHaveCount(0);
  await expect(page.locator('#editor')).toContainText('SyncService');
  await page.keyboard.press('Escape');
  await expect(page.locator('.ln.msg', { hasText: 'lunch?' })).toBeVisible();
});

test('edit and recall your own message', async ({ page }) => {
  await signUp(page);
  await run(page, 'typo hre');
  const line = page.locator('.ln.msg.mine');
  await line.click();
  await expect(page.locator('#dropdown')).toContainText('Recall');
  await page.locator('#dropdown').getByText('Edit…').click();
  await page.locator('#qiInput').fill('typo here');
  await page.keyboard.press('Enter');
  await expect(line).toContainText('typo here');
  await expect(line).toContainText('(edited)');
  await line.click();
  await page.locator('#dropdown').getByText('Recall').click();
  await expect(page.locator('.ln.recalled')).toContainText('Suu recalled a message');
});

test('friends’ messages only offer reply and copy', async ({ page }) => {
  await signUp(page);
  await friendSays(page, 'room1', 'hi');
  await page.locator('.ln.msg', { hasText: 'hi' }).click();
  await expect(page.locator('#dropdown')).toContainText('Reply');
  await expect(page.locator('#dropdown')).not.toContainText('Recall');
});

test('@mention autocomplete stores who was mentioned', async ({ page }) => {
  await signUp(page);
  await friendSays(page, 'room1', 'yo');
  await page.locator('#inp').click();
  await page.keyboard.type('see you @mi');
  await expect(page.locator('#dropdown')).toContainText('mika');
  await page.keyboard.press('Tab');
  await expect(page.locator('#inp')).toHaveValue('see you @mika ');
  await page.keyboard.press('Enter');
  const id = await roomId(page, 'room1');
  const stored = await page.evaluate(id => window.__fake.list(`rooms/${id}/msgs`), id);
  expect(stored.at(-1).at).toEqual(['friend_mika']);
});

test('muted room stays quiet, but an @mention still notifies', async ({ page }) => {
  await signUp(page);
  await run(page, ':room');
  await expect(page.locator('#qiInput')).toBeFocused();
  await page.keyboard.type('room2'); await page.keyboard.press('Enter');
  await expect(page.locator('.tab')).toHaveCount(2);
  await run(page, ':mute');
  await expect(page.locator('.tab[data-i="1"]')).toHaveClass(/muted/);
  await page.locator('.tab[data-i="0"]').click();
  await page.evaluate(() => { document.getElementById('toast').hidden = true; });
  await friendSays(page, 'room2', 'anyone?');
  await expect(page.locator('#probStatus')).toContainText('1');
  await expect(page.locator('#toast')).toBeHidden();
  const me = await page.evaluate(() => myId);
  await friendSays(page, 'room2', '@Suu come?', { at: [me] });
  await expect(page.locator('#toast')).toBeVisible();
  await expect(page.locator('#toastText')).toContainText('requested your review');
});

test('search finds older messages and jumps to them', async ({ page }) => {
  await signUp(page);
  await friendSays(page, 'room1', 'the ramen place in Shimokita');
  await friendSays(page, 'room1', 'something else');
  await run(page, ':search ramen');
  await expect(page.locator('#qiTitle')).toContainText('1 result');
  await page.keyboard.press('Enter');
  await expect(page.locator('.hitflash')).toContainText('ramen');
});

test('“new” divider marks messages that arrived while you were away', async ({ page }) => {
  await signUp(page);
  await friendSays(page, 'room1', 'first');
  await expect(page.locator('.ln.msg', { hasText: 'first' })).toBeVisible();
  // pretend the tab was in the background
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  await friendSays(page, 'room1', 'second');
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
  const texts = await page.locator('.ln.msg').allInnerTexts();
  const iDiv = texts.findIndex(t => t.includes('new'));
  const iSecond = texts.findIndex(t => t.includes('second'));
  expect(iDiv).toBeGreaterThan(-1);
  expect(iDiv).toBeLessThan(iSecond);
});

test('every skin renders the chat', async ({ page }) => {
  await signUp(page);
  await friendSays(page, 'room1', 'skin check');
  for (const skin of ['excel', 'notion', 'terminal', 'vscode']) {
    await run(page, `:skin ${skin}`);
    await expect(page.locator('body')).toHaveClass(`skin-${skin}`);
    await expect(page.locator('#editor')).toContainText('skin check');
  }
});
