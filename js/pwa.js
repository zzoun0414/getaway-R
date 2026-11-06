'use strict';
// Installable app (service worker) and disguised system notifications

// ---------- installable app (PWA) + disguised system notifications ----------
let swReg = null, installEvt = null;
if ('serviceWorker' in navigator && window.isSecureContext && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').then(r => { swReg = r; }).catch(() => {});
}
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; });
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
async function installApp(){
  if (isStandalone()) { showToast('Already installed<small>you are using the app version</small>', null); return; }
  if (installEvt) { installEvt.prompt(); try { await installEvt.userChoice; } catch(e){} installEvt = null; return; }
  if (isIOS()) { showToast('Add to Home Screen<small>tap the Share button ⬆︎ in Safari, then “Add to Home Screen”</small>', null); return; }
  showToast('Install from the browser menu<small>Chrome / Edge: ⋮ → “Install app” or “Add to Home screen”</small>', null);
}
let osNotif = store.get('osnotif', 'off') === 'on';
async function toggleOsNotif(){
  if (osNotif) { osNotif = false; store.set('osnotif', 'off'); showToast('System notifications off', null); return; }
  if (!('Notification' in window)) {
    showToast('Notifications not available here<small>' + (isIOS() && !isStandalone() ? 'on iPhone: add the app to your Home Screen first, then turn this on inside it' : 'this browser does not support them') + '</small>', null);
    return;
  }
  let p = Notification.permission;
  if (p === 'default') { try { p = await Notification.requestPermission(); } catch(e){ p = 'denied'; } }
  if (p !== 'granted') { showToast('Notifications are blocked<small>allow them for this site in your browser / phone settings</small>', null); return; }
  osNotif = true; store.set('osnotif', 'on');
  osNotify(1, 'test');
}
// what the notification says — never names or message text, so it is safe on a lock screen
function osText(n, kind){
  const build = 4800 + Math.floor(Math.random() * 190);
  if (kind === 'test') return { title: 'api-gateway', body: 'Notifications enabled for this workspace' };
  if (skin === 'excel') return { title: 'Excel', body: `Q4_order_sync.xlsx was updated (${n} change${n > 1 ? 's' : ''})` };
  if (skin === 'notion') return { title: 'Notion', body: kind === 'board' ? 'Team Updates — new entry' : `Q4 Sync Notes — ${n} new comment${n > 1 ? 's' : ''}` };
  if (skin === 'terminal') return { title: 'Terminal', body: `zsh: job finished (${n})` };
  if (kind === 'mention') return { title: skin === 'vscode' ? 'api-gateway' : skin === 'excel' ? 'Excel' : skin === 'notion' ? 'Notion' : 'Terminal', body: skin === 'vscode' ? 'Review requested on api-gateway' : skin === 'excel' ? 'You were @mentioned in Q4_order_sync.xlsx' : skin === 'notion' ? 'You were mentioned in Q4 Sync Notes' : 'zsh: bell' };
  return { title: 'api-gateway', body: kind === 'board' ? 'CHANGELOG.md updated' : kind === 'note' ? 'Review: 1 new comment on RFC' : `CI #${build} passed · ${n} new change${n > 1 ? 's' : ''}` };
}
let lastOs = 0;
function osNotify(n, kind, roomIdx){
  if (!osNotif || alertMode === 'quiet' || !('Notification' in window) || Notification.permission !== 'granted') return;
  if (kind !== 'test' && kind !== 'mention' && Date.now() - lastOs < 20000) return;   // at most one every 20 s (mentions always get through)
  lastOs = Date.now();
  const t = osText(n, kind);
  const opts = { body: t.body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'gw', renotify: true, silent: false };
  if (swReg && swReg.showNotification) swReg.showNotification(t.title, opts).catch(() => {});
  else { try { const x = new Notification(t.title, opts); x.onclick = () => { window.focus(); x.close(); }; } catch(e){} }
}
