'use strict';
// Rendering: chat in each skin, recipe, tabs, window chrome

// ---------- message rendering: VS Code ----------
function quoteOf(m){
  if (!m.re) return null;
  const orig = (cur()?.msgs || []).find(x => x.id === m.re.id);
  return { name: String(m.re.name || '').slice(0,16), text: String(m.re.text || ''), color: orig ? colorOf(orig) : colorOfUid(null, m.re.name) };
}
function roomMembers(r){
  const m = new Map();
  (r?.msgs || []).forEach(x => x.uid && m.set(x.uid, displayName(x)));
  (r?.board || []).forEach(x => x.uid && m.set(x.uid, displayName(x)));
  peersOf(r).forEach(p => m.set(p.uid, p.name));
  if (myId) m.set(myId, nick || 'dev');
  return m;
}
const mentionsMe = m => Array.isArray(m.at) && m.at.includes(myId);
function fmtText(m){
  let h = esc(m.text || '');
  if (m.text && m.text.includes('@')) {
    const names = new Set([...roomMembers(cur()).values()].map(n => n.toLowerCase()));
    h = h.replace(/@([^\s@<>&;]{1,16})/g, (all, n) => names.has(n.toLowerCase()) ? `<span class="at${n.toLowerCase() === (nick || '').toLowerCase() ? ' me' : ''}">@${n}</span>` : all);
  }
  return h + (m.edited ? ' <span class="edtag">(edited)</span>' : '');
}
function msgLine(m){
  const name = esc(displayName(m)), text = fmtText(m), t = hhmm(m.ms);
  const mine = m.uid === myId;
  if (m.img) {
    const v = 'img_' + t.replace(':','') + '_' + String(m.id).slice(-3).replace(/[^a-z0-9]/gi,'x');
    return `<span class="k2">import</span> <span class="v">${v}</span> <span class="k2">from</span> <span class="s imgref" data-img="${esc(m.img)}">'./assets/${imgName(m.img)}.jpg'</span>; <span class="cm">// </span><span class="mc nm">${name}</span>${m.text ? `<span class="cm"> — </span><span class="mc">${text}</span>` : ''}`;
  }
  if (style === 'log')
    return `<span class="k">this</span>.<span class="v">logger</span>.<span class="fn">${mine?'debug':'info'}</span>(<span class="s">'[</span><span class="mc nm">${name}</span><span class="s"> ${t}] </span><span class="mc">${text}</span><span class="s">'</span>);`;
  if (style === 'str') {
    const v = 'msg_' + t.replace(':','') + '_' + String(m.id).slice(-3).replace(/[^a-z0-9]/gi,'x');
    return `<span class="k">const</span> <span class="v">${v}</span> = <span class="s">'</span><span class="mc">${text}</span><span class="s">'</span>; <span class="cm">// </span><span class="mc nm">${name}</span>`;
  }
  return `<span class="cm">// </span><span class="tag">${mine?'TODO':'NOTE'}</span><span class="cm">(</span><span class="mc nm">${name}</span><span class="cm">, ${t}): </span><span class="mc">${text}</span>`;
}
const lrKey = r => `lr_${myId}_${r.id}`;
const lastRead = r => (r?.id ? +store.get(lrKey(r), '0') || 0 : 0);
function markRead(r){
  if (!r?.id || !r.msgs?.length) return;
  const mx = Math.max(...r.msgs.map(m => m.ms));
  if (mx > lastRead(r)) store.set(lrKey(r), String(mx));
}
function armDivider(r){ if (r) r.dividerAt = lastRead(r); }
// returns a function: call it for each message, it says whether the "new" divider goes before it
function dividerGate(){
  const r = cur(); let done = false;
  return m => { if (done || !r || !r.dividerAt || m.uid === myId || m.ms <= r.dividerAt) return false; done = true; return true; };
}
function peerFlags(){
  return typers().map(p => `<span class="pflag" style="--mc:${colorOfUid(p.uid, p.name)}"><i></i><b>${esc(p.name)}</b></span>`).join('');
}
function renderCode(msgs){
  const lines = [];
  const push = (code, ind=0, cls='') => lines.push({ html: hl(code), ind, cls });
  HEADER.forEach(l => push(l));
  let methodIdx = 0, sinceOpen = 0;
  const openMethod = () => { push(METHODS[methodIdx % METHODS.length]); methodIdx++; sinceOpen = 0; };
  const closeMethod = () => { CLOSERS[methodIdx % CLOSERS.length].forEach(l => push('    '+l)); push('  }'); push(''); };
  openMethod();
  push('    const started = Date.now();');
  const gate = dividerGate();
  msgs.forEach((m, i) => {
    const r = rng(hash(String(m.id)));
    if (!panic) {
      if (gate(m)) lines.push({ html: '<span class="cm">// ──────────────── new ────────────────</span>', ind: 4, cls: 'msg divider' });
      if (m.recalled) lines.push({ html: `<span class="cm">// ${esc(displayName(m))} recalled a message</span>`, ind: 4, cls: 'msg recalled' });
      else {
        const q = quoteOf(m);
        if (q) lines.push({ html: `<span class="cm">// ↳ re </span><span class="mc nm">${esc(q.name)}</span><span class="cm">: ${esc(q.text)}</span>`, ind: 4, cls: 'msg req', mc: q.color });
        lines.push({ html: msgLine(m), ind: 4, cls: 'msg' + (m.uid===myId?' mine':'') + (m._new?' new':'') + (mentionsMe(m)?' atme':''), mc: colorOf(m), mid: m.id });
      }
    }
    const nBlocks = panic ? 1 + Math.floor(r()*2) : Math.floor(r()*1.7);
    for (let b=0; b<nBlocks; b++) BLOCKS[Math.floor(r()*BLOCKS.length)].forEach(l => push(l ? '    '+l : ''));
    sinceOpen++;
    if (sinceOpen >= 6 + Math.floor(r()*4) && i < msgs.length-1) { closeMethod(); openMethod(); }
  });
  if (!msgs.length || panic) BLOCKS.slice(2,8).forEach(b => b.forEach(l => push('    '+l)));
  closeMethod();
  push('}');
  push('');
  const curLine = lines.length - 3;
  const flags = peerFlags();
  $('cursorPos').textContent = `Ln ${curLine+1}, Col ${5 + (msgs.length * 7) % 30}`;
  return lines.map((l, i) =>
    `<div class="ln ${l.cls}${i===curLine?' cur':''}"${l.mc ? ` style="--mc:${l.mc}"` : ''}${l.mid ? ` data-mid="${esc(l.mid)}"` : ''}><span class="g">${i+1}</span><span class="c" style="--ind:${l.ind}ch">${l.html || ' '}${i===curLine ? flags : ''}</span></div>`
  ).join('');
}

// ---------- message rendering: Excel ----------
const REGIONS = ['Kanto', 'Kansai', 'Chubu', 'Kyushu', 'Tohoku', 'Hokkaido'];
const STATUS = ['Shipped', 'Pending', 'Shipped', 'Delivered', 'Backorder', 'Shipped'];
const yen = n => '¥' + n.toLocaleString('en-US');
function xlFiller(r, ms){
  const d = new Date(ms - Math.floor(r()*86400000*5));
  const qty = 1 + Math.floor(r()*48), unit = 800 + Math.floor(r()*120)*50;
  return [d.toISOString().slice(0,10), 'ORD-' + (40000 + Math.floor(r()*9999)), REGIONS[Math.floor(r()*REGIONS.length)], qty, yen(unit), yen(qty*unit), STATUS[Math.floor(r()*STATUS.length)]];
}
function renderExcel(msgs){
  const COLS = 'ABCDEFGH'.split('');
  let rowN = 1;
  const rows = [];
  const cell = (v, cls='') => `<td class="${cls}">${v}</td>`;
  rows.push(`<tr><td class="rn">${rowN++}</td>${['Date','Order','Region','Qty','Unit','Amount','Status',''].map(h => cell(`<b>${h}</b>`)).join('')}</tr>`);
  const fill = (r, ms) => { const f = xlFiller(r, ms); rows.push(`<tr><td class="rn">${rowN++}</td>${cell(f[0])}${cell(f[1])}${cell(f[2])}${cell(f[3],'num')}${cell(f[4],'num')}${cell(f[5],'num')}${cell(f[6])}${cell('')}</tr>`); };
  const base = rng(hash(cur()?.id || 'x'));
  for (let i=0;i<3;i++) fill(base, Date.now());
  const gate = dividerGate();
  msgs.forEach(m => {
    const r = rng(hash(String(m.id)));
    if (!panic && gate(m)) rows.push(`<tr class="msg divider"><td class="rn">${rowN++}</td><td colspan="8">new</td></tr>`);
    if (!panic && m.recalled) rows.push(`<tr class="msg recalled"><td class="rn">${rowN++}</td>${cell(hhmm(m.ms))}${cell(esc(displayName(m)))}<td class="xq" colspan="6">recalled a message</td></tr>`);
    else if (!panic) {
      const q = quoteOf(m);
      const mine = m.uid === myId;
      const body = m.img
        ? `<span class="xlink imgref" data-img="${esc(m.img)}">📎 ${imgName(m.img)}.jpg</span>${m.text ? ' ' + fmtText(m) : ''}`
        : fmtText(m);
      if (q) rows.push(`<tr class="msg req" style="--mc:${q.color}"><td class="rn">${rowN++}</td>${cell('')}${cell(`<span class="mc">↳ ${esc(q.name)}</span>`)}<td class="xq" colspan="6">${esc(q.text)}</td></tr>`);
      rows.push(`<tr class="msg${mine?' mine':''}${m._new?' new':''}${mentionsMe(m)?' atme':''}" data-mid="${esc(m.id)}" style="--mc:${colorOf(m)}"><td class="rn">${rowN++}</td>${cell(hhmm(m.ms))}${cell(`<span class="mc nm">${esc(displayName(m))}</span>`)}<td class="xm" colspan="6">${body}</td></tr>`);
    }
    const n = panic ? 1 + Math.floor(r()*2) : Math.floor(r()*1.6);
    for (let i=0;i<n;i++) fill(r, m.ms);
  });
  const ty = typers();
  const last = rowN;
  rows.push(`<tr><td class="rn">${rowN++}</td><td class="xsel"></td>${COLS.slice(1).map((c, ci) => {
    const p = ty[ci]; return p ? `<td class="xpeer" style="--mc:${colorOfUid(p.uid, p.name)}" data-n="${esc(p.name)}"></td>` : '<td></td>';
  }).join('')}</tr>`);
  for (let i=0;i<6;i++) rows.push(`<tr><td class="rn">${rowN++}</td>${COLS.map(() => '<td></td>').join('')}</tr>`);
  $('cursorPos').textContent = '';
  $('xaddr').textContent = 'A' + last;
  return `<table class="xl"><colgroup><col style="width:42px"><col style="width:84px"><col style="width:96px"><col style="width:92px"><col style="width:56px"><col style="width:78px"><col style="width:96px"><col style="width:88px"><col style="width:80px"></colgroup>
    <thead><tr><th class="rn"></th>${COLS.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
}

// ---------- message rendering: Notion ----------
const N_FILL = [
  ['h2', 'Agenda'], ['li', 'Review order sync latency (p95 target: 300ms)'], ['li', 'Retry policy for upstream timeouts'],
  ['todo', 'Update runbook for webhook replays'], ['li', 'Tenant-scoped cache keys — rollout status'], ['done', 'Migrate metrics to new dashboard'],
  ['h2', 'Notes'], ['p', 'Backfill finished for Kanto and Kansai; Chubu pending.'], ['todo', 'Confirm on-call rotation for next sprint'],
  ['li', 'Batch size stays at 50 until load test'], ['p', 'Decision: keep Redis TTL at 300s.'], ['done', 'Share load test results'],
];
function renderNotion(msgs){
  const out = [];
  const page = view === 'recipe' ? 'recipe' : PAGES[active % PAGES.length];
  out.push(`<div class="nt"><div class="nicon">📄</div><h1>${esc(page)}</h1><div class="props">Owner&nbsp;&nbsp;Platform Team &nbsp;·&nbsp; Last edited ${hhmm(Date.now())}</div>`);
  const blk = ([k, t]) => out.push(k === 'h2' ? `<h2>${esc(t)}</h2>` : `<div class="b ${k}">${esc(t)}</div>`);
  N_FILL.slice(0, 4).forEach(blk);
  if (!panic) out.push('<h2>Discussion</h2>');
  const gate = dividerGate();
  msgs.forEach(m => {
    const r = rng(hash(String(m.id)));
    if (!panic && gate(m)) out.push('<div class="ndiv msg divider"><span>New</span></div>');
    if (!panic && m.recalled) out.push(`<div class="nrec msg recalled">${esc(displayName(m))} recalled a message</div>`);
    else if (!panic) {
      const q = quoteOf(m);
      const body = m.img ? `<span class="nfile imgref" data-img="${esc(m.img)}">📎 ${imgName(m.img)}.jpg</span>${m.text ? ' ' + fmtText(m) : ''}` : fmtText(m);
      out.push(`<div class="ncm msg${m._new?' new':''}${mentionsMe(m)?' atme':''}" data-mid="${esc(m.id)}" style="--mc:${colorOf(m)}"><span class="av">${esc(displayName(m).slice(0,1).toUpperCase())}</span><div><div><span class="who">${esc(displayName(m))}</span><span class="when">${hhmm(m.ms)}</span></div>${q ? `<div class="nre">↳ ${esc(q.name)}: ${esc(q.text)}</div>` : ''}<div class="ntext">${body}</div></div></div>`);
    }
    if (panic || r() < 0.15) blk(N_FILL[4 + Math.floor(r()*(N_FILL.length-4))]);
  });
  const ty = typers();
  if (ty.length) out.push(`<div class="ntyping">${ty.map(p => esc(p.name)).join(', ')} ${ty.length>1?'are':'is'} typing…</div>`);
  if (panic) N_FILL.slice(6).forEach(blk);
  out.push('</div>');
  $('cursorPos').textContent = '';
  return out.join('');
}

// ---------- message rendering: terminal (tmux) ----------
const T_FILL = [
  r => `<span class="g1">INFO </span> sync.worker  batch processed: ${Math.floor(r()*50)} items`,
  r => `<span class="g1">INFO </span> http  GET /api/v1/orders 200 ${3+Math.floor(r()*40)}ms`,
  r => `<span class="y1">WARN </span> reconcile  retry ${1+Math.floor(r()*2)}/3 — upstream timeout`,
  r => `<span class="b1">DEBUG</span> redis  cache ${r()>.3?'HIT':'MISS'} orders:${Math.floor(r()*1e6).toString(36)}`,
  r => `<span class="g1">INFO </span> http  POST /api/v1/webhooks/stripe 201 ${10+Math.floor(r()*90)}ms`,
];
function renderTmux(msgs){
  const out = [];
  const line = (ms, html, cls='', extra='') => out.push(`<div class="tl ${cls}"${extra}><span class="d1">${hhmmss(ms)}</span> ${html}</div>`);
  const base = rng(hash(cur()?.id || 'x'));
  const t0 = msgs.length ? msgs[0].ms : Date.now();
  for (let i=0;i<4;i++) line(t0 - (4-i)*53000, T_FILL[Math.floor(base()*T_FILL.length)](base));
  const gate = dividerGate();
  msgs.forEach(m => {
    const r = rng(hash(String(m.id)));
    if (!panic && gate(m)) out.push('<div class="tl msg divider"><span class="y1">-- new --</span></div>');
    if (!panic && m.recalled) line(m.ms, `<span class="d1">${esc(displayName(m))} recalled a message</span>`, 'msg recalled');
    else if (!panic) {
      const q = quoteOf(m);
      if (q) out.push(`<div class="tl msg req" style="--mc:${q.color}"><span class="d1">         ↳ ${esc(q.name)}: ${esc(q.text)}</span></div>`);
      const body = m.img ? `<span class="imgref tlink" data-img="${esc(m.img)}">./assets/${imgName(m.img)}.jpg</span>${m.text ? ' ' + fmtText(m) : ''}` : fmtText(m);
      line(m.ms, `<span class="mc">${esc(displayName(m))}</span> <span class="d1">›</span> <span class="mc">${body}</span>`, 'msg' + (m._new ? ' new' : '') + (mentionsMe(m) ? ' atme' : ''), ` data-mid="${esc(m.id)}" style="--mc:${colorOf(m)}"`);
    }
    const n = panic ? 1 + Math.floor(r()*2) : Math.floor(r()*1.5);
    for (let i=0;i<n;i++) line(m.ms + (i+1)*7000, T_FILL[Math.floor(r()*T_FILL.length)](r));
  });
  const ty = typers();
  if (ty.length) out.push(`<div class="tl"><span class="d1">-- ${ty.map(p => esc(p.name)).join(', ')} typing --</span></div>`);
  out.push('<div class="tl"><span class="tcur">█</span></div>');
  $('cursorPos').textContent = hhmm(Date.now()) + ' ' + new Date().toDateString().slice(4,10);
  return out.join('');
}

// ---------- recipe ----------
const RECIPE = [
  '# recipe',
  '',
  '> 给朋友的使用说明。看完点标签上的 ✕ 关掉，或按 Esc 直接隐藏。',
  '',
  '## 开始',
  '- 打开网址 → 登录账号 → 输入房间码（暗号）',
  '- 第一次用：选「＋ Create a new account」，起一个名字、设一个密码',
  '- 名字注册后就固定了，不分大小写，别人不能再用同一个名字',
  '- 换电脑或手机：用同一个账号登录，消息都还算你的；这台设备用过的账号会列在登录页',
  '- **没有找回密码**，密码要自己记住',
  '- 房间码相同的人在同一个聊天室',
  '- 朋友发来的邀请链接：点开就直接进房间，不用输房间码',
  '- 打开过的房间会记在这个浏览器里，下次直接进入',
  '',
  '## 聊天',
  '- 在下面的输入框打字，回车发送',
  '- 自己的消息是 **蓝色**，每个朋友有自己固定的颜色',
  '- 行号旁边的色条也能看出是谁：虚线 = 自己，实线 = 朋友',
  '- **点一下某条消息**：弹出菜单 —— Reply 回复 / Copy Text 复制 / Edit… 编辑 / Recall 撤回（后两个只对自己的消息）',
  '- 回复时输入框前出现 `↳ 名字`，点 ✕ 取消；编辑过的消息后面有 (edited)；撤回后显示「xx recalled a message」',
  '- **@某人**：打 `@` 会弹出成员名单，↑↓ 选、Tab 或回车确认；被 @ 的那行会高亮，提醒伪装成「xx requested your review」',
  '- **新消息分隔线**：离开再回来时，没看过的消息上面会有一条 `── new ──`',
  '- **搜索**：Edit › Search Chat… 或 `:search 关键词`，搜这个房间最近 500 条',
  '- **静音**：View › Mute This Workspace 或 `:mute`（`:unmute` 取消）——只计未读、不闪不弹，但被 @ 照样提醒；静音的标签是斜体',
  '- **发图片**：直接粘贴（Ctrl/⌘+V）、拖进窗口，或 File › Attach Image…',
  '- 图片显示成一个文件名：电脑上鼠标停上去预览，点击看大图；手机上点一下看大图',
  '',
  '## 谁在线',
  '- 状态栏 `👥 数字` = 当前房间在线人数，点开能看到是谁、谁在输入、谁离开了',
  '- 朋友正在打字时，光标所在行会出现带名字的小旗子（像多人协作编辑）',
  '',
  '## 隐藏',
  '- 电脑：按 `Esc`，或点当前标签页',
  '- 手机：点当前标签页；切到别的 App 会自动隐藏',
  '- 再操作一次恢复',
  '',
  '## 新消息提醒',
  '- 状态栏闪橙色，右下角弹出一条伪装通知，点它直接跳到那个房间',
  '- 状态栏的未读数 = 所有房间的未读总数；标签上的白点 = 那个房间有未读',
  '- 浏览器在后台时，标签页标题会闪',
  '- 不想被打扰：`:alert quiet`（只计数，不闪不弹）；恢复：`:alert on`',
  '',
  '## 多个房间 / 邀请',
  '- `:room` 或 File › New Workspace… 开新房间（新标签页，最多 6 个）',
  '- 点标签切换，点 ✕ 关闭（记录还在，用房间码能再打开）',
  '- File › Copy Invite Link（或 `:invite`）复制当前房间的邀请链接，发给朋友',
  '',
  '## 一起读书',
  '- File › Read Together…（或 `:read`）：看这个房间里的书，或上传一本新书',
  '- 支持 EPUB、MOBI、AZW3 / AZW / PRC、TXT（UTF-8 / GBK / Big5 / Shift_JIS 自动识别）、FB2、HTML',
  '- 亚马逊买的带 DRM 的书读不了；PDF、Word 请先另存为 TXT 或 EPUB',
  '- 书会显示成一份文档（VS Code 里叫 RFC-xxxx.md），按 Esc 一样会隐藏',
  '- 翻页：顶部 / 底部的 ‹ Prev / Next ›、键盘 ← →，或 `:p 页码`；每本书会记住你读到哪一页、哪个位置',
  '- 看着累：点顶部的 **Aa** 调字号、行距、栏宽、字体（黑体 / 宋体 / 等宽）、柔和对比；键盘 − = 也能调字号',
  '- 顶部会显示朋友在读第几页，点名字跳过去；点旁边的 follow 进入**跟读**：她翻页你自动跟着翻，你自己翻页就退出',
  '- **Contents**：章节目录（自动识别「第X章 / 序章 / Chapter 1」等），可以输入关键字筛选；顶部会显示当前章节',
  '- **Find**（或 `:find 关键词`）：全书搜索，列出每个位置的上下文，点一下跳过去，关键词会高亮；点顶部的 “关键词 ✕” 取消高亮',
  '- **Notes (n)**：全书批注总览，按段落排序，可以筛选，点一下跳过去',
  '- **划线批注**：选中一段文字 → 点「💬 Comment」→ 写下想法',
  '- 点段落前的编号 = 给整段写批注；批注下面可以 Reply 互相讨论',
  '- 朋友写了新批注会弹提醒，点提醒直接跳到那一页',
  '- 只能删自己的批注；上传书的人可以在 Edit › Delete This Book… 删掉整本书',
  '',
  '## 留言板',
  '- File › Message Board（或 `:board`；VS Code 里是左边的 CHANGELOG.md）',
  '- 每个房间一块，适合留不想被聊天刷掉的话；可以选「to: 某人」写给特定的朋友',
  '- 每条留言下面都能 Reply；自己的可以删',
  '- 上线时会提示「上次之后有 N 条新留言」，新的会标 new',
  '- 房间里的人都看得到，写给某人的也一样',
  '',
  '## 私人便签 / 待办',
  '- File › My Notes & To-dos（或 `:todo`；VS Code 里是左边的 TODO.md）',
  '- **只有你自己看得到**，换设备登录也会同步',
  '- 待办：输入后回车添加，点 ☐ 勾选，悬停出现 ✕ 删除',
  '- 便签：随便写，停手一秒多就自动保存',
  '- **阅读统计**：读书时自动记录（离开或两分钟没动静就暂停计时）——今天读了多久、几页，最近 7 天的柱状图，每本书的累计；可以一键分享到留言板',
  '',
  '## 装到手机桌面 / 系统通知',
  '- iPhone：用 Safari 打开 → 分享按钮 ⬆︎ →「添加到主屏幕」；安卓 / 电脑 Chrome：View › Install as App…',
  '- 装好后桌面上是一个叫 Gateway 的 </> 图标，打开是全屏的，没有浏览器地址栏',
  '- View › System Notifications 打开系统通知（iPhone 要在装到桌面的 App 里打开）；通知只写「CI #4821 passed · 2 new changes」这类话，不会出现名字和内容',
  '- 注意：目前 App 在后台运行时才会弹通知；彻底关掉或锁屏很久以后收不到（需要推送服务器，还在计划中）',
  '',
  '## 换皮肤',
  '- View › Skin，或 `:skin vscode|excel|notion|terminal`',
  '- Excel：消息是表格里的行，房间是底部的工作表；输入框在公式栏',
  '- Notion：消息是页面里的评论；输入框是「Add a comment…」',
  '- Terminal：像 tmux 分屏，消息混在日志里；房间是底部的窗口',
  '',
  '## 菜单',
  '- 顶部菜单都能点；手机上是左上角 ☰',
  '',
  '## 指令',
  '- `:help`                         列出所有指令',
  '- `:read`                         一起读书（打开 / 上传）',
  '- `:board`                        这个房间的留言板',
  '- `:todo`                         私人便签和待办',
  '- `:p 页码`                        跳到书的某一页',
  '- `:signout`                      登出 / 切换账号',
  '- `:skin vscode|excel|notion|terminal`  换伪装',
  '- `:style comment|log|str`        VS Code 里消息的样子',
  '- `:room` / `:close`              开 / 关房间',
  '- `:invite`                       复制邀请链接',
  '- `:img`                          选一张图片发送',
  '- `:clear`                        删除自己在当前房间的全部消息（会再确认一次）',
  '- `:logs off|slow|normal|fast`    终端假日志的速度',
  '- `:alert on|quiet`               新消息提醒方式',
  '- `:recipe`                       打开这份说明',
  '',
  '## 注意',
  '好好吃饭哦',
];
function mdHl(line){
  let h = esc(line);
  if (/^#{1,6} /.test(line)) return `<span class="md-h">${h}</span>`;
  if (/^&gt; /.test(h)) return `<span class="md-q">${h}</span>`;
  h = h.replace(/`([^`]+)`/g, '<span class="md-c">`$1`</span>').replace(/\*\*([^*]+)\*\*/g, '<span class="md-b">**$1**</span>');
  return h.replace(/^- /, '<span class="md-l">-</span> ');
}
function renderRecipe(){
  if (skin === 'vscode') {
    editor.innerHTML = RECIPE.map((l, i) => `<div class="ln"><span class="g">${i+1}</span><span class="c">${mdHl(l) || ' '}</span></div>`).join('');
    $('cursorPos').textContent = 'Ln 1, Col 1';
  } else if (skin === 'notion') {
    editor.innerHTML = `<div class="nt"><div class="nicon">📖</div><h1>recipe</h1>${RECIPE.slice(1).map(l =>
      /^## /.test(l) ? `<h2>${esc(l.slice(3))}</h2>` : /^- /.test(l) ? `<div class="b li">${esc(l.slice(2))}</div>` : l ? `<div class="b">${esc(l.replace(/^> /,''))}</div>` : '').join('')}</div>`;
  } else if (skin === 'excel') {
    editor.innerHTML = `<table class="xl"><colgroup><col style="width:42px"><col></colgroup><thead><tr><th class="rn"></th><th>A</th></tr></thead><tbody>${RECIPE.map((l, i) =>
      `<tr><td class="rn">${i+1}</td><td class="xm">${/^#/.test(l) ? `<b>${esc(l.replace(/^#+ /,''))}</b>` : esc(l)}</td></tr>`).join('')}</tbody></table>`;
  } else {
    editor.innerHTML = `<div class="tl"><span class="g1">$</span> cat recipe.md</div>` + RECIPE.map(l => `<div class="tl">${mdHl(l) || ' '}</div>`).join('');
  }
  editor.scrollTop = 0;
}

// ---------- main render ----------
function render(){
  if (typeof applyFocus === 'function') applyFocus();
  if (view === 'recipe') { renderRecipe(); return; }
  if (view === 'book') { renderBook(); return; }
  if (view === 'board') { renderBoard(); return; }
  if (view === 'notes') { renderNotes(); return; }
  const msgs = cur()?.msgs || [];
  const nearBottom = editor.scrollHeight - editor.scrollTop - editor.clientHeight < 80;
  editor.innerHTML = skin === 'excel' ? renderExcel(msgs) : skin === 'notion' ? renderNotion(msgs) : skin === 'terminal' ? renderTmux(msgs) : renderCode(msgs);
  msgs.forEach(m => { m._new = false; });
  if (nearBottom || scrollBottom) editor.scrollTop = editor.scrollHeight;
  scrollBottom = false;
  if (!panic && !isAway()) markRead(cur());
}

// ---------- chrome per skin ----------
const STATUS_TEXT = {
  vscode:   { sBranch: '⎇ main*', sSync: '⟳', sSpaces: 'Spaces: 2', sEnc: 'UTF-8', sEol: 'LF', panicBtn: '✓ Prettier' },
  excel:    { sBranch: 'Ready', sSync: '', sSpaces: '', sEnc: '', sEol: '', panicBtn: '▦ Normal' },
  notion:   { sBranch: '', sSync: '', sSpaces: '', sEnc: '', sEol: '', panicBtn: '✓ Saved' },
  terminal: { sBranch: '[api]', sSync: '', sSpaces: '', sEnc: '', sEol: '', panicBtn: '"mbp"' },
};
const PLACEHOLDER = { vscode: '', excel: '', notion: 'Add a comment…', terminal: '' };
const THEME = { vscode: '#3c3c3c', excel: '#217346', notion: '#fbfbfa', terminal: '#2b2b2b' };
function applySkin(){
  document.body.className = 'skin-' + skin;
  const labels = MENU_LABELS[skin];
  document.querySelectorAll('#menu > span').forEach((s, i) => { s.textContent = labels[i] || ''; s.style.display = labels[i] ? '' : 'none'; });
  Object.entries(STATUS_TEXT[skin]).forEach(([id, t]) => { $(id).textContent = t; });
  $('styleBtn').style.display = skin === 'vscode' ? '' : 'none';
  inp.placeholder = PLACEHOLDER[skin];
  const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = THEME[skin];
  scrollBottom = true;
  editor.innerHTML = '';
  renderTabs(); render();
}

function roomLabelText(){
  if (skin === 'excel') return '＋ Sheet';
  if (skin === 'notion') return '＋ New page';
  if (skin === 'terminal') return '＋ new-window';
  return '⧉ ' + (cur()?.id ? 'ssh: ' + cur().id.slice(0, 6) : 'local');
}
function renderTabs(){
  const tabs = $('tabs');
  const list = rooms.length ? rooms : [null];
  const recipeLabel = skin === 'vscode' ? '<span style="color:#519aba;font-size:10px">M↓</span> recipe.md' : skin === 'terminal' ? `${list.length}:recipe` : 'recipe';
  tabs.innerHTML = list.map((r, i) =>
    `<div class="tab${i===active && view==='room'?' on':''}${r && r.unread ? ' unread' : ''}${isMuted(r) ? ' muted' : ''}" data-i="${i}"${isMuted(r) ? ' title="Muted"' : ''}>${esc(tabLabel(i))} <span class="dot"></span>${r ? '<span class="x" data-x="'+i+'">✕</span>' : ''}</div>`
  ).join('') + (recipeOpen ? `<div class="tab${view==='recipe'?' on':''}" data-doc="recipe">${recipeLabel} <span class="x" data-xdoc="recipe">✕</span></div>` : '')
    + (book ? `<div class="tab${view==='book'?' on':''}" data-doc="book">${skin === 'vscode' ? '<span style="color:#519aba;font-size:10px">M↓</span> ' : ''}${esc(bookTabLabel())} <span class="x" data-xdoc="book">✕</span></div>` : '')
    + (boardOpen ? `<div class="tab${view==='board'?' on':''}${boardUnreadCount(cur()) ? ' unread' : ''}" data-doc="board">${skin === 'vscode' ? '<span style="color:#519aba;font-size:10px">M↓</span> ' : ''}${docName('board')} <span class="dot"></span><span class="x" data-xdoc="board">✕</span></div>` : '')
    + (notesOpen ? `<div class="tab${view==='notes'?' on':''}" data-doc="notes">${skin === 'vscode' ? '<span style="color:#519aba;font-size:10px">M↓</span> ' : ''}${docName('notes')} <span class="x" data-xdoc="notes">✕</span></div>` : '');
  const [file, dir, cls] = fileOf(active);
  const shown = view === 'room' ? file : docName(view);
  if (skin === 'notion') $('crumbs').innerHTML = `${view === 'notes' ? 'Private' : 'Engineering'} &nbsp;/&nbsp; ${esc(shownName())}`;
  else $('crumbs').innerHTML = view === 'board' || view === 'notes'
    ? `<span style="color:#519aba;font-size:10px">M↓</span> ${esc(shown)}`
    : view === 'book' && book
    ? `docs › <span style="color:#519aba;font-size:10px">M↓</span> ${esc(bookFile(book.id))}`
    : view === 'recipe'
    ? `<span style="color:#519aba;font-size:10px">M↓</span> recipe.md › # recipe`
    : `src › ${dir} › <span style="color:#3178c6;font-size:10px;font-weight:700">TS</span> ${file} › <span style="color:#ee9d28">◇</span> ${cls}`;
  $('ttl').textContent = skin === 'vscode' ? `${shown} — api-gateway` : skin === 'excel' ? 'Q4_order_sync.xlsx  ·  Saved' : skin === 'notion' ? windowTitle() : 'zsh — api-gateway — 132×43';
  document.querySelectorAll('.tree > div').forEach(d => d.classList.toggle('sel', d.textContent.trim().split(/\s+/)[0] === shown));
  $('roomLabel').textContent = roomLabelText();
  const on = tabs.querySelector('.tab.on'); if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  updateUnread();
  updatePeers();
}
