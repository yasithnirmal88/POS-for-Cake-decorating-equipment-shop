// Minimal test harness: loads the CakePOS index.html into jsdom and evaluates
// the vanilla-JS modules with a mocked Firebase/Auth behind them.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const PROJECT = process.env.CAKEPOS_PROJECT
  || path.resolve(__dirname, '..');

// Return a fresh jsdom window with the app DOM + a Firebase mock installed.
function freshWindow() {
  let html = fs.readFileSync(path.join(PROJECT, 'index.html'), 'utf8');
  html = html.replace(/<script src="https:[^"]*"><\/script>/g, '');
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://cakepos.test/#/pos' });
  const win = dom.window;
  installFirebaseMock(win);
  return win;
}

// Evaluate a project module file inside a window.
function evalModule(win, relPath) {
  const code = fs.readFileSync(path.join(PROJECT, relPath), 'utf8');
  const fn = new win.Function('window', 'document', 'console', 'alert', 'confirm', code);
  fn(win, win.document, win.console,
    (msg) => { win.__lastAlert = String(msg); },
    () => true);
}

function installFirebaseMock(win) {
  const FieldValue = { increment: (n) => ({ __increment: n }) };
  win.firebase = {
    firestore: { FieldValue },
    functions: () => ({ httpsCallable: (name) => () => Promise.resolve({ data: { ok: false } }) }),
  };
  win.firebaseApp = {};
  win.firebaseAuth = {
    onAuthStateChanged: () => {},
    signInWithEmailAndPassword: async () => ({ user: { uid: 'u1', email: 'a@b.com' } }),
    signOut: async () => {},
  };
  const emptySnap = () => ({ empty: true, docs: [], size: 0, forEach: () => {} });
  const queryChain = {
    get: async () => emptySnap(),
    onSnapshot: (cb) => { cb(emptySnap()); return () => {}; },
    where: () => queryChain,
    orderBy: () => queryChain,
    limit: () => queryChain,
  };
  win.firebaseDb = {
    collection: () => ({
      doc: () => ({ get: async () => ({ exists: false, data: () => ({}) }), set: async () => {}, update: async () => {} }),
      where: () => queryChain,
      orderBy: () => queryChain,
      limit: () => queryChain,
      get: async () => emptySnap(),
      onSnapshot: (cb) => { cb(emptySnap()); return () => {}; },
      add: async (d) => ({ id: 'new' }),
    }),
    runTransaction: async (fn) => fn({ get: async () => ({ exists: false, data: () => ({}) }), set: async () => {} }),
  };
}

module.exports = { freshWindow, evalModule, PROJECT };