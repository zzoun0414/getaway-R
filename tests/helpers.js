// Shared test helpers: a fake Firebase, sign-up, and a check that the page threw no errors.
const { test: base, expect } = require('@playwright/test');
const path = require('path');

const FAKE = path.join(__dirname, 'fake-firebase.js');

const test = base.extend({
  page: async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    // every Firebase SDK URL is answered with the in-memory fake
    await page.route(/https:\/\/www\.gstatic\.com\/firebasejs\//, route => route.fulfill({ path: FAKE, contentType: 'text/javascript' }));
    await page.route(/fonts\.(googleapis|gstatic)\.com/, route => route.fulfill({ body: '', contentType: 'text/css' }));
    await use(page);
    expect(errors, 'uncaught errors in the page').toEqual([]);
  },
});

/** Create an account and join a room. Leaves the app on the chat view. */
async function signUp(page, { name = 'Suu', password = 'secret1', room = 'room1', recipe = false } = {}) {
  await page.goto('/');
  await expect(page.locator('#qi')).toBeVisible();
  await page.keyboard.press('Enter');                 // "＋ Create a new account"
  await page.keyboard.type(name); await page.keyboard.press('Enter');
  await page.keyboard.type(password); await page.keyboard.press('Enter');
  await page.keyboard.type(password); await page.keyboard.press('Enter');
  await expect(page.locator('#qiTitle')).toHaveText(/Connect to Remote Workspace/);
  await page.keyboard.type(room); await page.keyboard.press('Enter');
  await expect(page.locator('#qiTitle')).toHaveText(/Open recipe/);
  await page.keyboard.type(recipe ? 'y' : 'n'); await page.keyboard.press('Enter');
  await expect(page.locator('#qi')).toBeHidden();
  await expect(page.locator('#term')).toContainText('connected');
}

/** Firestore id of a room code (same hash the app uses). */
const roomId = (page, code) => page.evaluate(c => roomKey(c), code);

/** Write a message into a room as if a friend sent it. */
async function friendSays(page, code, text, extra = {}) {
  const id = await roomId(page, code);
  await page.evaluate(([id, text, extra]) => window.__fake.add(`rooms/${id}/msgs`, { uid: 'friend_mika', name: 'mika', text, ...extra }), [id, text, extra]);
}

/** Type a command or message into the bottom input and press Enter. */
async function run(page, text) {
  await page.locator('#inp').fill(text);
  await page.locator('#inp').press('Enter');
}

module.exports = { test, expect, signUp, roomId, friendSays, run };
