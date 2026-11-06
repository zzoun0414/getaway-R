// In-memory stand-in for the Firebase SDK, used only by the tests.
// The tests serve this file in place of every https://www.gstatic.com/firebasejs/*/firebase-*.js URL,
// so it exports the union of the app / auth / firestore / database functions the app uses.
// Security rules are NOT simulated here — they are checked in the Firebase console's rules playground.

const S = (globalThis.__fake ||= {
  docs: new Map(),          // Firestore: path -> data
  fsListeners: new Set(),   // {kind, path, constraints, next}
  rtdb: {},                 // Realtime Database tree
  rtdbListeners: new Set(), // {path, cb}
  users: new Map(),         // email -> {uid, password, displayName}
  user: null,
  seq: 0,
  clock: 0,
});
// accounts survive a page reload (like the real Auth service would)
try { if (!S.loaded) { S.loaded = true; for (const [k, v] of JSON.parse(localStorage.getItem('__fake_users') || '[]')) S.users.set(k, v); } } catch (e) {}
const saveUsers = () => { try { localStorage.setItem('__fake_users', JSON.stringify([...S.users])); } catch (e) {} };
const now = () => Date.now() + (S.clock += 1);
const nextId = () => 'id' + (++S.seq).toString(36) + Math.random().toString(36).slice(2, 7);

// ---------- app ----------
export const initializeApp = cfg => ({ cfg });

// ---------- auth ----------
const authObj = {};
export const getAuth = () => authObj;
export function onAuthStateChanged(auth, cb){ setTimeout(() => cb(S.user), 0); return () => {}; }
export async function createUserWithEmailAndPassword(auth, email, password){
  if (S.users.has(email)) throw { code: 'auth/email-already-in-use' };
  if (String(password).length < 6) throw { code: 'auth/weak-password' };
  const u = { uid: 'u_' + nextId(), email, displayName: null, isAnonymous: false };
  S.users.set(email, { ...u, password }); saveUsers();
  S.user = u; return { user: u };
}
export async function signInWithEmailAndPassword(auth, email, password){
  const rec = S.users.get(email);
  if (!rec || rec.password !== password) throw { code: 'auth/invalid-credential' };
  S.user = { uid: rec.uid, email, displayName: rec.displayName, isAnonymous: false };
  return { user: S.user };
}
export async function updateProfile(user, p){
  user.displayName = p.displayName;
  for (const rec of S.users.values()) if (rec.uid === user.uid) rec.displayName = p.displayName;
  saveUsers();
}
export const EmailAuthProvider = { credential: (email, password) => ({ email, password }) };
export async function linkWithCredential(user, cred){
  if (S.users.has(cred.email)) throw { code: 'auth/credential-already-in-use' };
  S.users.set(cred.email, { uid: user.uid, email: cred.email, password: cred.password, displayName: null }); saveUsers();
  user.isAnonymous = false; user.email = cred.email;
  return { user };
}
export async function signOut(){ S.user = null; }

// ---------- firestore ----------
const TS = '__serverTimestamp__';
const stamp = ms => ({ toMillis: () => ms, seconds: Math.floor(ms / 1000) });
export const getFirestore = () => ({});
export const serverTimestamp = () => ({ [TS]: true });
export const increment = n => ({ __inc: n });
export const documentId = () => '__id__';
export const collection = (db, ...segs) => ({ kind: 'col', path: segs.join('/') });
export function doc(db, ...segs){ const path = segs.join('/'); return { kind: 'doc', path, id: segs[segs.length - 1] }; }
export const orderBy = (field, dir = 'asc') => ({ type: 'orderBy', field, dir });
export const limit = n => ({ type: 'limit', n });
export const where = (field, op, value) => ({ type: 'where', field, op, value });
export const query = (col, ...constraints) => ({ kind: 'query', path: col.path, constraints });

function resolve(value, prev){
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    if (value[TS]) return stamp(now());
    if ('__inc' in value) return (typeof prev === 'number' ? prev : 0) + value.__inc;
    if (typeof value.toMillis === 'function') return value;
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = resolve(v, prev && typeof prev === 'object' ? prev[k] : undefined);
    return out;
  }
  return value;
}
function merge(prev, patch){
  const out = { ...(prev || {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && !v[TS] && !('__inc' in v) && typeof v.toMillis !== 'function' && out[k] && typeof out[k] === 'object') out[k] = merge(out[k], v);
    else out[k] = resolve(v, out[k]);
  }
  return out;
}
const isChild = (path, colPath) => path.startsWith(colPath + '/') && !path.slice(colPath.length + 1).includes('/');
const snap = (path, data) => ({
  id: path.split('/').pop(), ref: { path, id: path.split('/').pop() },
  exists: () => data !== undefined, data: () => (data === undefined ? undefined : data),
});
function runQuery(path, constraints = []){
  let rows = [...S.docs.entries()].filter(([p]) => isChild(p, path)).map(([p, d]) => ({ p, d }));
  for (const c of constraints) if (c.type === 'where' && c.op === '==') rows = rows.filter(r => r.d[c.field] === c.value);
  const ob = constraints.find(c => c.type === 'orderBy');
  if (ob) {
    const key = r => ob.field === '__id__' ? r.p.split('/').pop() : (r.d[ob.field]?.toMillis ? r.d[ob.field].toMillis() : r.d[ob.field]);
    rows.sort((a, b) => (key(a) > key(b) ? 1 : key(a) < key(b) ? -1 : 0) * (ob.dir === 'desc' ? -1 : 1));
  }
  const lim = constraints.find(c => c.type === 'limit');
  if (lim) rows = rows.slice(0, lim.n);
  const docs = rows.map(r => snap(r.p, r.d));
  return { docs, size: docs.length, empty: !docs.length };
}
function emit(changedPath){
  for (const l of S.fsListeners) {
    if (l.kind === 'doc' ? l.path === changedPath : isChild(changedPath, l.path)) deliver(l);
  }
}
function deliver(l){ setTimeout(() => { if (!S.fsListeners.has(l)) return; l.next(l.kind === 'doc' ? snap(l.path, S.docs.get(l.path)) : runQuery(l.path, l.constraints)); }, 0); }
export async function addDoc(col, data){ const id = nextId(); const path = col.path + '/' + id; S.docs.set(path, resolve(data)); emit(path); return { id, path }; }
export async function setDoc(ref, data, opts){ S.docs.set(ref.path, opts && opts.merge ? merge(S.docs.get(ref.path), data) : resolve(data)); emit(ref.path); }
export async function updateDoc(ref, patch){ if (!S.docs.has(ref.path)) throw { code: 'not-found' }; S.docs.set(ref.path, merge(S.docs.get(ref.path), patch)); emit(ref.path); }
export async function deleteDoc(ref){ S.docs.delete(ref.path); emit(ref.path); }
export async function getDoc(ref){ return snap(ref.path, S.docs.get(ref.path)); }
export async function getDocs(q){ return runQuery(q.path, q.constraints || []); }
export function onSnapshot(target, next){
  const l = { kind: target.kind === 'doc' ? 'doc' : 'col', path: target.path, constraints: target.constraints || [], next };
  S.fsListeners.add(l); deliver(l);
  return () => S.fsListeners.delete(l);
}

// ---------- realtime database ----------
export const getDatabase = () => ({});
export const ref = (db, path) => ({ path: String(path).replace(/^\/|\/$/g, '') });
const segs = p => (p ? p.split('/') : []);
function rget(path){ let o = S.rtdb; for (const k of segs(path)) { if (o == null || typeof o !== 'object') return null; o = o[k]; } return o === undefined ? null : o; }
function rset(path, val){
  const ks = segs(path); let o = S.rtdb;
  for (let i = 0; i < ks.length - 1; i++) { if (typeof o[ks[i]] !== 'object' || o[ks[i]] === null) o[ks[i]] = {}; o = o[ks[i]]; }
  if (val === null || val === undefined) delete o[ks[ks.length - 1]]; else o[ks[ks.length - 1]] = JSON.parse(JSON.stringify(val));
  for (const l of S.rtdbListeners) if (path.startsWith(l.path) || l.path.startsWith(path)) setTimeout(() => S.rtdbListeners.has(l) && l.cb({ val: () => rget(l.path) }), 0);
}
export async function set(r, val){ rset(r.path, val); }
export async function update(r, patch){ for (const [k, v] of Object.entries(patch)) rset(r.path + '/' + k, v); }
export async function remove(r){ rset(r.path, null); }
export function onValue(r, cb){
  if (r.path === '.info/connected') { setTimeout(() => cb({ val: () => true }), 0); return () => {}; }
  const l = { path: r.path, cb }; S.rtdbListeners.add(l);
  setTimeout(() => S.rtdbListeners.has(l) && cb({ val: () => rget(r.path) }), 0);
  return () => S.rtdbListeners.delete(l);
}
export const onDisconnect = () => ({ remove: async () => {} });

// ---------- helpers the tests call through window.__fake ----------
S.add = async (path, data) => addDoc({ path }, { ts: serverTimestamp(), ...data });
S.list = path => runQuery(path, [{ type: 'orderBy', field: 'ts', dir: 'asc' }]).docs.map(d => ({ id: d.id, ...d.data() }));
S.presence = (path, val) => rset(path, val);
