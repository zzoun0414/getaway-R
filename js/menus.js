'use strict';
// Menu bar and dropdowns

// ---------- menus ----------
const MENUS = {
  File: () => [
    ['New Workspace…', () => command(':room')],
    ['Read Together…', readTogether],
    [`Message Board${boardUnreadCount(cur()) ? ` (${boardUnreadCount(cur())} new)` : ''}`, () => openBoard()],
    ['My Notes & To-dos', () => openNotes()],
    ['Upload Book…', () => $('bookIn').click()],
    ['Copy Invite Link', copyInvite],
    ['Attach Image…', () => $('fileIn').click()],
    ['Close Editor', () => view === 'recipe' ? closeRecipe() : command(':close')],
    '-',
    ['Open recipe', openRecipe],
  ],
  Edit: () => [
    ['Search Chat…', () => command(':search')],
    ...(view === 'book' && book && book.meta.uid === myId ? [['Delete This Book…', deleteBook]] : []),
    ...(replyTo ? [['Cancel Reply', () => setReply(null)]] : []),
    '-',
    ['Clear My Messages in This Workspace…', () => command(':clear')],
  ],
  View: () => [
    '#Skin',
    ...[['vscode','VS Code'],['excel','Excel'],['notion','Notion'],['terminal','Terminal (tmux)']].map(([k, l]) => [l, () => command(':skin ' + k), skin === k]),
    ...(skin === 'vscode' ? ['-', '#Message Style', ...['comment','log','str'].map(k => [k[0].toUpperCase() + k.slice(1), () => command(':style ' + k), style === k])] : []),
    '-',
    '#New Message Alerts',
    ['Flash + Popup', () => command(':alert on'), alertMode === 'on'],
    ['Count Only (Quiet)', () => command(':alert quiet'), alertMode === 'quiet'],
    ['Mute This Workspace', () => setMuted(!isMuted(cur())), isMuted(cur())],
    '-',
    ['Toggle Chat', () => togglePanic(), false, 'Esc'],
    ...(skin === 'vscode' ? [['Toggle Sidebar', () => $('mainEl').classList.toggle('nosb')]] : []),
    ['Full Screen', () => $('fsBtn').click()],
    '-',
    ['Install as App…', installApp],
    [`System Notifications: ${osNotif ? 'On' : 'Off'}`, toggleOsNotif, osNotif],
  ],
  Terminal: () => [
    '#Log Speed',
    ...['off','slow','normal','fast'].map(k => [k[0].toUpperCase() + k.slice(1), () => command(':logs ' + k), logSpeed === k]),
    '-',
    ['Clear Terminal', () => { term.innerHTML = ''; }],
  ],
  Account: () => [
    [`Signed in as ${nick || '—'}`, () => {}],
    ['Switch Account…', doSignOut],
    ['Sign Out', doSignOut],
  ],
  Help: () => [
    ['recipe', openRecipe],
    ['Show All Commands', () => command(':help')],
  ],
};
let menuActions = [];
function itemsHtml(items){
  return items.map(it => {
    if (it === '-') return '<div class="sep"></div>';
    if (typeof it === 'string' && it[0] === '#') return `<div class="grp">${esc(it.slice(1))}</div>`;
    const [label, fn, checked, kb] = it;
    menuActions.push(fn);
    return `<div class="mi${checked ? ' chk' : ''}" data-a="${menuActions.length - 1}"><span>${esc(label)}</span>${kb ? `<span class="kb">${kb}</span>` : ''}</div>`;
  }).join('');
}
function openMenu(anchor, names){
  const dd = $('dropdown');
  menuActions = [];
  dd.innerHTML = names.length === 1 ? itemsHtml(MENUS[names[0]]())
    : names.map(n => `<div class="grp mh">${MENU_LABELS[skin][['File','Edit','','View','','','Terminal','Help'].indexOf(n)] || n}</div>` + itemsHtml(MENUS[n]())).join('<div class="sep"></div>');
  if (names.length === 1 && names[0] === 'Account') dd.querySelector('.mi')?.classList.add('dim');
  dd.hidden = false;
  const r = anchor.getBoundingClientRect();
  dd.style.top = (r.bottom + 2) + 'px';
  dd.style.left = Math.max(4, Math.min(r.left, window.innerWidth - dd.offsetWidth - 4)) + 'px';
  document.querySelectorAll('.menu span').forEach(s => s.classList.toggle('open', s === anchor));
}
function closeMenu(){ $('dropdown').hidden = true; delete $('dropdown').dataset.rs; delete $('dropdown').dataset.at; atState = null; document.querySelectorAll('.menu span.open').forEach(s => s.classList.remove('open')); }
$('menu').addEventListener('click', e => {
  const sp = e.target.closest('[data-m]'); if (!sp) return;
  e.stopPropagation();
  if (sp.classList.contains('open')) closeMenu(); else openMenu(sp, [sp.dataset.m]);
});
$('menu').addEventListener('mouseover', e => {
  const sp = e.target.closest('[data-m]');
  if (sp && !$('dropdown').hidden && !sp.classList.contains('open') && document.querySelector('.menu span.open')) openMenu(sp, [sp.dataset.m]);
});
$('hamb').addEventListener('click', e => {
  e.stopPropagation();
  if ($('dropdown').hidden) openMenu($('hamb'), skin === 'notion' ? ['File','Edit','View','Account','Help'] : ['File','Edit','View','Terminal','Account','Help']);
  else closeMenu();
});
$('dropdown').addEventListener('click', e => {
  e.stopPropagation();
  const mi = e.target.closest('[data-a]'); if (!mi) return;
  const fn = menuActions[+mi.dataset.a]; closeMenu(); fn && fn();
});
document.addEventListener('click', () => { if (!$('dropdown').hidden) closeMenu(); });

function updateWho(){ $('who').textContent = (nick || 'dev') + '@mbp'; }
