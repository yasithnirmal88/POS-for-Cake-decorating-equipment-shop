// Security tests for CakePOS Cloud Functions.
//
// These tests mock firebase-functions / firebase-functions/params /
// firebase-admin with an in-memory Firestore so the exported handlers can be
// invoked directly with fake call contexts. They exercise the authorization
// and validation logic WITHOUT contacting the real Firebase project.
//
// Run: node test/functions-security.test.js
"use strict";

const path = require("path");

// ---------------------------------------------------------------------------
// Minimal in-memory Firestore used by the Admin SDK mock.
// ---------------------------------------------------------------------------
class MemDB {
  constructor() {
    this.data = {}; // collection -> docId -> doc
  }
  settings() {} // no-op to satisfy db.settings({...})
  collection(name) {
    return new MemCol(this, name);
  }
  async runTransaction(fn) {
    const tx = new MemTx(this);
    await fn(tx);
    tx._commitNow();
  }
  listCollections() {
    return Object.keys(this.data).map((id) => new MemCol(this, id));
  }
}

class MemCol {
  constructor(db, id) {
    this.db = db;
    this.id = id;
    this._docs = db.data[id] || (db.data[id] = {});
  }
  doc(id) {
    return new MemDoc(this, id);
  }
  where() { return this; }
  orderBy() { return this; }
  limit() { return this; }
  startAfter() { return this; }
  async get() {
    const docs = Object.keys(this._docs).map((id) => ({
      id,
      exists: true,
      data: () => JSON.parse(JSON.stringify(this._docs[id])),
    }));
    return { empty: docs.length === 0, size: docs.length, docs, forEach: (cb) => docs.forEach(cb) };
  }
}

class MemDoc {
  constructor(col, id) {
    this.col = col;
    this.id = id;
  }
  async get() {
    const d = this.col._docs[this.id];
    return { exists: !!d, data: () => (d ? JSON.parse(JSON.stringify(d)) : null) };
  }
  async set(data) {
    this.col._docs[this.id] = JSON.parse(JSON.stringify(data));
  }
  async update(data) {
    this.col._docs[this.id] = Object.assign({}, this.col._docs[this.id], JSON.parse(JSON.stringify(data)));
  }
}

class MemTx {
  constructor(db) {
    this.db = db;
    this._writes = [];
  }
  async get(docRef) {
    const d = docRef.col._docs[docRef.id];
    return { exists: !!d, data: () => (d ? JSON.parse(JSON.stringify(d)) : null) };
  }
  set(docRef, data) {
    this._writes.push([docRef, JSON.parse(JSON.stringify(data))]);
  }
  _commitNow() {
    for (const [ref, data] of this._writes) {
      ref.col._docs[ref.id] = data;
    }
  }
}

const dbState = new MemDB();

// ---------------------------------------------------------------------------
// Mock firebase-functions / params / admin.
// ---------------------------------------------------------------------------

const mockFunctions = {
  https: {
    onCall: (fn) => fn,
    HttpsError: class HttpsError extends Error {
      constructor(code, message) {
        super(message);
        this.code = code;
      }
    },
  },
  pubsub: {
    schedule: () => ({ onRun: (fn) => fn }),
  },
};

const paramValues = {
  ADMIN_EMAILS: process.env.TEST_ADMIN_EMAILS || "admin@cakepos.test, second@cakepos.test",
  BACKUP_BUCKET: process.env.TEST_BACKUP_BUCKET || "",
};

const mockParams = {
  defineString: (name, _opts) => ({ value: () => paramValues[name] }),
  storageBucket: { value: () => "cakepos-76286.appspot.com" },
};

const mockAdmin = {
  initializeApp: () => {},
  firestore: () => dbState,
  firestoreFieldValue: { serverTimestamp: () => "TS" },
};

mockAdmin.firestore.FieldValue = mockAdmin.firestoreFieldValue;
mockAdmin.firestore.Timestamp = { now: () => ({ toMillis: () => Date.now(), toDate: () => new Date() }) };

// Patch module resolution/loading for the mocked packages.
const Module = require("module");
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "firebase-functions") return mockFunctions;
  if (request === "firebase-functions/params") return mockParams;
  if (request === "firebase-admin") return mockAdmin;
  return origLoad.call(this, request, parent, isMain);
};

// Load the real functions module under the mocks. Because onCall returns the
// raw handler, exported functions ARE the handlers directly.
const fns = require(path.join(__dirname, "..", "index.js"));

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;
function check(name, cond) {
  if (cond) { passed++; console.log("  PASS " + name); }
  else { failed++; console.log("  FAIL " + name); }
}
function ctx(uid, email) {
  return { auth: { uid, token: { email } } };
}
async function expectError(fn, code) {
  try { await fn(); } catch (e) { return e.code === code; }
  return false;
}
function seedUser(id, data) {
  dbState.data.users = dbState.data.users || {};
  dbState.data.users[id] = data;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
(async () => {
  console.log("bootstrapAdmin:");
  check("unauthenticated blocked",
    await expectError(() => fns.bootstrapAdmin({}, { auth: null }), "unauthenticated"));
  check("non-admin email denied",
    await expectError(() => fns.bootstrapAdmin({}, ctx("u1", "hacker@evil.com")), "permission-denied"));

  const res = await fns.bootstrapAdmin({ name: "Syn" }, ctx("u1", "admin@cakepos.test"));
  check("allowed email succeeds", res && res.ok === true);
  const prof = dbState.data.users["u1"];
  check("profile role is admin", prof && prof.role === "admin");
  check("profile branchId all", prof && prof.branchId === "all");
  check("profile active", prof && prof.active === true);

  dbState.data.users["u1"].name = "Changed";
  const res2 = await fns.bootstrapAdmin({ name: "Other" }, ctx("u1", "admin@cakepos.test"));
  check("idempotent returns existing", res2.ok === true);
  check("existing profile not overwritten", dbState.data.users["u1"].name === "Changed");

  await fns.bootstrapAdmin({ name: "X", role: "manager", branchId: "branch_02" }, ctx("u2", "second@cakepos.test"));
  check("client role ignored (admin)", dbState.data.users["u2"].role === "admin");
  check("client branch ignored (all)", dbState.data.users["u2"].branchId === "all");

  console.log("createSale:");
  dbState.data.products = { p1: { name: "Sprinkles", price: 5, active: true, barcode: "123" } };
  dbState.data.inventory = { branch_01_p1: { productId: "p1", branchId: "branch_01", stockQuantity: 10 } };
  seedUser("cashier1", { role: "cashier", branchId: "branch_01", active: true, email: "c1@x.com" });
  seedUser("cashier2", { role: "cashier", branchId: "branch_02", active: true, email: "c2@x.com" });

  check("createSale unauthenticated",
    await expectError(() => fns.createSale({}, { auth: null }), "unauthenticated"));
  check("cross-branch cashier denied",
    await expectError(() => fns.createSale(
      { branchId: "branch_02", requestId: "req12345", paymentMethod: "cash",
        items: [{ productId: "p1", quantity: 1 }] },
      ctx("cashier1", "c1@x.com")), "permission-denied"));

  const sale = await fns.createSale(
    { branchId: "branch_01", requestId: "req12345", paymentMethod: "cash",
      items: [{ productId: "p1", quantity: 2, price: 0.01 }] },
    ctx("cashier1", "c1@x.com"));
  check("sale created", sale && sale.ok === true);
  check("server price used (5)", sale.sale.items[0].price === 5);
  check("subtotal = 10", sale.sale.subtotal === 10);
  check("tax 10% = 1", sale.sale.tax === 1);
  check("total = 11", sale.sale.total === 11);
  check("inventory deducted to 8", dbState.data.inventory.branch_01_p1.stockQuantity === 8);

  const sale2 = await fns.createSale(
    { branchId: "branch_01", requestId: "req12345", paymentMethod: "cash",
      items: [{ productId: "p1", quantity: 2 }] },
    ctx("cashier1", "c1@x.com"));
  check("duplicate requestId idempotent", sale2.duplicate === true);
  check("no double deduction", dbState.data.inventory.branch_01_p1.stockQuantity === 8);

  dbState.data.inventory.branch_01_p1.stockQuantity = 1;
  check("insufficient stock rejected",
    await expectError(() => fns.createSale(
      { branchId: "branch_01", requestId: "req99999", paymentMethod: "cash",
        items: [{ productId: "p1", quantity: 5 }] },
      ctx("cashier1", "c1@x.com")), "failed-precondition"));
  check("invalid payment method rejected",
    await expectError(() => fns.createSale(
      { branchId: "branch_01", requestId: "req88888", paymentMethod: "bitcoin",
        items: [{ productId: "p1", quantity: 1 }] },
      ctx("cashier1", "c1@x.com")), "invalid-argument"));

  console.log("transferStock:");
  seedUser("mgr1", { role: "manager", branchId: "all", active: true, email: "m@x.com" });
  seedUser("cashier3", { role: "cashier", branchId: "branch_01", active: true, email: "c3@x.com" });
  dbState.data.inventory.branch_01_p1.stockQuantity = 10;
  dbState.data.inventory.branch_02_p1 = { productId: "p1", branchId: "branch_02", stockQuantity: 0 };

  check("cashier cannot transfer",
    await expectError(() => fns.transferStock(
      { productId: "p1", fromBranch: "branch_01", toBranch: "branch_02", quantity: 1 },
      ctx("cashier3", "c3@x.com")), "permission-denied"));
  const tr = await fns.transferStock(
    { productId: "p1", fromBranch: "branch_01", toBranch: "branch_02", quantity: 3 },
    ctx("mgr1", "m@x.com"));
  check("manager transfer ok", tr.ok === true);
  check("source decremented to 7", dbState.data.inventory.branch_01_p1.stockQuantity === 7);
  check("dest incremented to 3", dbState.data.inventory.branch_02_p1.stockQuantity === 3);
  check("transfer audit written", dbState.data.transfers && Object.keys(dbState.data.transfers).length > 0);
  check("negative qty rejected",
    await expectError(() => fns.transferStock(
      { productId: "p1", fromBranch: "branch_01", toBranch: "branch_02", quantity: -1 },
      ctx("mgr1", "m@x.com")), "invalid-argument"));
  check("insufficient source stock",
    await expectError(() => fns.transferStock(
      { productId: "p1", fromBranch: "branch_01", toBranch: "branch_02", quantity: 999 },
      ctx("mgr1", "m@x.com")), "failed-precondition"));

  console.log("\nRESULTS: " + passed + " passed, " + failed + " failed");
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error("FATAL TEST ERROR:", e);
  process.exit(1);
});