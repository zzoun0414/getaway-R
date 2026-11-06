'use strict';
// Start-up: sign in, join rooms

// ---------- start ----------
applySkin();
updateWho();
termLine(isMobile() ? '<span class="d1">Type :help for commands. Tap the current tab or the status-bar button to hide the chat.</span>' : '<span class="d1">Type :help for commands. Press Esc anytime to hide the chat.</span>');

(async () => {
  if (String(firebaseConfig.apiKey).startsWith('PASTE')) {
    termLine('<span class="r1">fatal: firebaseConfig is empty — paste your Firebase config at the top of index.html</span>');
    return;
  }
  let app;
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    let u = await new Promise(res => { const off = onAuthStateChanged(auth, x => { off(); res(x); }); });
    if (!u || u.isAnonymous || !u.displayName) u = await accountFlow(u);
    myId = u.uid; nick = String(u.displayName || 'dev').slice(0, 16);
    rememberAccount(nick); updateWho();
  } catch (e) {
    termLine(`<span class="r1">fatal: sign-in failed (${esc(e?.code||e?.message||'unknown')})</span>`);
    return;
  }
  try {
    rtdb = getDatabase(app);
    // re-announce presence whenever the connection comes back
    onValue(dbRef(rtdb, '.info/connected'), s => { if (s.val() === true) rooms.forEach(r => r.id && joinPresence(r)); });
  } catch (e) { rtdb = null; presenceWarn(e); }

  subscribeMine();
  for (const r of rooms) await subscribe(r);
  saveRooms(); renderTabs();
  if (inviteCode) {
    await addRoom(inviteCode);
    showToast(`Joined workspace via invite<small>${esc(tabLabel(active))}</small>`, null);
  }
  if (!rooms.length) {
    const c = await ask('Connect to Remote Workspace', 'Enter workspace token (same code as your friends)', '', true);
    if (!c) { termLine('<span class="y1">no workspace token — type :room to connect</span>'); return; }
    await addRoom(c);
  }
  if (!store.get('recipeAsked', '')) {
    store.set('recipeAsked', '1');
    const yn = await ask('Open recipe? (Y/N)', 'Y = show the guide · N = skip (Help › recipe anytime)');
    if (yn && /^y/i.test(yn)) openRecipe();
  }
  if (!isMobile()) inp.focus();
})();
