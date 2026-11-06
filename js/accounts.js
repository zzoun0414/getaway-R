'use strict';
// Quick-pick list and accounts (sign-in / sign-up)

// ---------- quick pick (VS Code style list) ----------
function quickPick(title, items, placeholder = 'Type to filter', isError = false){
  return new Promise(resolve => {
    const qi = $('qi'), qin = $('qiInput'), list = $('qiList');
    $('qiTitle').textContent = title; $('qiTitle').classList.toggle('err', isError);
    $('qiHint').textContent = '↑↓ to select · Enter to confirm';
    qin.type = 'text'; qin.value = ''; qin.placeholder = placeholder;
    let sel = 0, shown = items;
    const draw = () => {
      const f = qin.value.trim().toLowerCase();
      shown = items.filter(it => !f || it.label.toLowerCase().includes(f) || it.always);
      sel = Math.min(sel, Math.max(0, shown.length - 1));
      list.innerHTML = shown.map((it, i) => `<div class="qit${i === sel ? ' on' : ''}" data-i="${i}"><span>${esc(it.label)}</span>${it.detail ? `<small>${esc(it.detail)}</small>` : ''}</div>`).join('') || '<div class="qit dim">No matches</div>';
    };
    const done = v => {
      qi.hidden = true; qiCancel = null; list.hidden = true; list.innerHTML = ''; $('qiTitle').classList.remove('err');
      $('qiHint').textContent = "Press 'Enter' to confirm or 'Escape' to cancel";
      qin.removeEventListener('keydown', onKey); qin.removeEventListener('input', onInput); list.removeEventListener('mousedown', onClick);
      resolve(v);
    };
    qiCancel = () => done(null);
    const onInput = () => { sel = 0; draw(); };
    const onKey = e => {
      e.stopPropagation();
      if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, shown.length - 1); draw(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); draw(); e.preventDefault(); }
      else if (e.key === 'Enter') { e.preventDefault(); if (shown[sel]) done(shown[sel].value); }
      else if (e.key === 'Escape') done(null);
    };
    const onClick = e => { const el = e.target.closest('[data-i]'); if (el) { e.preventDefault(); done(shown[+el.dataset.i].value); } };
    qin.addEventListener('keydown', onKey); qin.addEventListener('input', onInput); list.addEventListener('mousedown', onClick);
    list.hidden = false; qi.hidden = false; draw(); qin.focus(); setTimeout(() => { if (document.activeElement !== qin) qin.focus(); }, 0);
  });
}

// ---------- accounts ----------
// account name -> fixed, case-insensitive login id (an internal address nobody ever sees or receives mail at)
const emailOf = name => 'u.' + b64u(name.trim().toLowerCase()) + '@getaway-r.app';
const knownAccounts = () => { try { return JSON.parse(store.get('accounts', '[]')) || []; } catch(e){ return []; } };
function rememberAccount(name){ const a = knownAccounts().filter(x => x.toLowerCase() !== name.toLowerCase()); a.unshift(name); store.set('accounts', JSON.stringify(a.slice(0, 8))); }
const AUTH_ERR = {
  'auth/invalid-credential': 'Wrong account name or password', 'auth/wrong-password': 'Wrong account name or password',
  'auth/user-not-found': 'Wrong account name or password', 'auth/invalid-login-credentials': 'Wrong account name or password',
  'auth/email-already-in-use': 'That name is already taken — sign in instead, or pick another name',
  'auth/credential-already-in-use': 'That name is already taken — sign in instead, or pick another name',
  'auth/weak-password': 'Password must be at least 6 characters',
  'auth/too-many-requests': 'Too many attempts — wait a minute and try again',
  'auth/operation-not-allowed': 'Email/Password sign-in is not enabled in Firebase yet',
  'auth/network-request-failed': 'Network error — check your connection',
};
const authMsg = e => AUTH_ERR[e?.code] || `Sign-in failed (${e?.code || e?.message || 'unknown'})`;
async function accountFlow(anonUser){
  let err = '';
  for (;;) {
    const items = knownAccounts().map(n => ({ label: n, detail: 'used on this device', value: { mode: 'in', name: n } }));
    items.push({ label: '＋ Create a new account', detail: anonUser ? 'keeps this browser\'s chat history' : 'pick a name — it stays yours', value: { mode: 'up' }, always: true });
    items.push({ label: 'Sign in with another account…', detail: 'name + password', value: { mode: 'in' }, always: true });
    const ch = await quickPick(err || 'Accounts — sign in to sync your workspace', items, 'Select an account', !!err);
    err = '';
    if (!ch) continue;
    if (ch.mode === 'in') {
      const name = ch.name || await ask('Sign in', 'Account name');
      if (!name) continue;
      const pw = await ask(`Sign in as ${name}`, 'Password', '', true);
      if (!pw) continue;
      try { const r = await signInWithEmailAndPassword(auth, emailOf(name), pw); return r.user; }
      catch (e) { err = authMsg(e); }
    } else {
      const name = await ask('Create account', 'Account name: 2–12 characters, this is what friends see (cannot be changed)');
      if (!name) continue;
      const n = name.trim();
      if ([...n].length < 2 || [...n].length > 12 || /[\s:@<>"'`\\]/.test(n)) { err = 'Names must be 2–12 characters, no spaces or :@<>"\'`\\'; continue; }
      const pw = await ask(`Choose a password for ${n}`, 'At least 6 characters — there is no reset, remember it', '', true);
      if (!pw) continue;
      const pw2 = await ask('Confirm password', 'Type the password again', '', true);
      if (pw !== pw2) { err = 'Passwords did not match'; continue; }
      try {
        let user;
        if (anonUser && anonUser.isAnonymous) {
          const r = await linkWithCredential(anonUser, EmailAuthProvider.credential(emailOf(n), pw));
          user = r.user;
        } else {
          const r = await createUserWithEmailAndPassword(auth, emailOf(n), pw);
          user = r.user;
        }
        await updateProfile(user, { displayName: n });
        return user;
      } catch (e) { err = authMsg(e); }
    }
  }
}
async function doSignOut(){
  rooms.forEach(r => leavePresence(r));
  try { await signOut(auth); } catch(e){}
  location.reload();
}
