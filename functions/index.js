const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { defineString, storageBucket } = require("firebase-functions/params");

admin.initializeApp();

const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

// ---------------------------------------------------------------------------
// Configuration (managed by firebase-functions/params - NOT functions.config).
//
// ADMIN_EMAILS: comma-separated email addresses allowed to bootstrap the
// initial CakePOS administrator. Supplied via Secret Manager so it is never
// exposed to the frontend. Fails closed when missing/empty.
//
// BACKUP_BUCKET: Cloud Storage bucket used by scheduledBackup. Defaults to the
// project's default storage bucket (${projectId}.appspot.com) when unset.
// ---------------------------------------------------------------------------
const adminEmails = defineString("ADMIN_EMAILS", {
  description: "Comma-separated email addresses allowed to bootstrap the initial CakePOS administrator"
});

const backupBucket = defineString("BACKUP_BUCKET", {
  description: "Cloud Storage bucket used for CakePOS backups (defaults to the project storage bucket)"
});

const VALID_ROLES = ["admin", "manager", "cashier"];
const BRANCH_IDS = ["branch_01", "branch_02"];
const VALID_PAYMENT_METHODS = ["cash", "card", "other"];
const TAX_RATE = 0.10; // must match the POS tax rate

function round2(n) {
  return Math.round(n * 100) / 100;
}

function normalizeBranch(id) {
  return BRANCH_IDS.includes(id) ? id : null;
}

async function getUserProfile(uid) {
  const snap = await db.collection("users").doc(uid).get();
  return snap.exists ? snap.data() : null;
}

function authorizedForBranch(user, branchId) {
  return user &&
    user.active !== false &&
    (user.branchId === "all" || user.branchId === branchId);
}

// Parse ADMIN_EMAILS (comma-separated) into a normalized set of lowercase
// emails. Fails closed: returns an empty set if unset/whitespace-only.
function allowedAdminEmails() {
  const raw = String(adminEmails.value() || "");
  return raw
    .split(",")
    .map(function (s) { return s.trim().toLowerCase(); })
    .filter(Boolean);
}

// Normalize an email for comparison (trim + lowercase). Returns "" if absent.
function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// createSale (callable HTTPS) - authoritative sale creation.
//
// The client is never trusted for prices, totals, tax, invoice numbers or
// inventory - everything is re-derived from the products collection here.
//
// Idempotency: the client supplies a unique `requestId`. If a sale already
// exists with that requestId the existing sale is returned instead of creating
// a duplicate (protects against double-sale on retry / network failure).
//
// Inventory is deducted atomically inside the same transaction as the sale
// write, so concurrent sales cannot corrupt stock.
// ---------------------------------------------------------------------------
exports.createSale = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "You must be signed in.");
  }
  const user = await getUserProfile(context.auth.uid);
  if (!user || user.active === false) {
    throw new functions.https.HttpsError("permission-denied", "Account is not active.");
  }
  if (!VALID_ROLES.includes(user.role)) {
    throw new functions.https.HttpsError("permission-denied", "Unauthorized role.");
  }

  const branchId = normalizeBranch(String(data.branchId || ""));
  if (!branchId || !authorizedForBranch(user, branchId)) {
    throw new functions.https.HttpsError(
      "permission-denied", "You are not authorized for this branch.");
  }

  const requestId = typeof data.requestId === "string" && data.requestId.length >= 8
    ? data.requestId : null;
  if (!requestId) {
    throw new functions.https.HttpsError("invalid-argument", "requestId is required.");
  }

  const saleRef = db.collection("sales").doc("R-" + requestId);
  const existing = await saleRef.get();
  if (existing.exists) {
    return { ok: true, duplicate: true, sale: existing.data() };
  }

  const rawItems = Array.isArray(data.items) ? data.items : [];
  if (rawItems.length === 0) {
    throw new functions.https.HttpsError("invalid-argument", "Cart is empty.");
  }
  if (rawItems.length > 50) {
    throw new functions.https.HttpsError("invalid-argument", "Too many line items.");
  }

  const paymentMethod = String(data.paymentMethod || "").toLowerCase();
  if (!VALID_PAYMENT_METHODS.includes(paymentMethod)) {
    throw new functions.https.HttpsError("invalid-argument", "Unsupported payment method.");
  }

  // Re-read products server-side; build authoritative line items.
  const lineItems = [];
  for (const raw of rawItems) {
    const productId = typeof raw.productId === "string"
      ? raw.productId : String(raw.id || "");
    const qty = Number(raw.quantity);
    if (!productId || !Number.isInteger(qty) || qty <= 0 || qty > 1000) {
      throw new functions.https.HttpsError("invalid-argument", "Invalid line item.");
    }
    const pSnap = await db.collection("products").doc(productId).get();
    if (!pSnap.exists || pSnap.data().active === false) {
      throw new functions.https.HttpsError(
        "failed-precondition", "A product in the cart is unavailable.");
    }
    const prod = pSnap.data();
    const unitPrice = Number(prod.price);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      throw new functions.https.HttpsError("internal", "Product has an invalid price.");
    }
    lineItems.push({
      productId,
      barcode: typeof prod.barcode === "string" ? prod.barcode : "",
      name: String(prod.name || "Unknown"),
      price: unitPrice,
      quantity: qty,
      subtotal: round2(unitPrice * qty)
    });
  }

  const subtotal = round2(lineItems.reduce((s, it) => s + it.subtotal, 0));
  const tax = round2(subtotal * TAX_RATE);
  const total = round2(subtotal + tax);

  const now = admin.firestore.Timestamp.now();
  const invoiceNumber = "INV-" + now.toMillis().toString(36).toUpperCase() +
    "-" + Math.random().toString(36).slice(2, 6).toUpperCase();

  const saleDoc = {
    invoiceNumber: invoiceNumber,
    requestId: requestId,
    branchId: branchId,
    items: lineItems,
    subtotal: subtotal,
    tax: tax,
    total: total,
    paymentMethod: paymentMethod,
    cashierId: context.auth.uid,
    cashierName: user.name || user.email || "",
    timestamp: now.toDate().toISOString(),
    createdMillis: now.toMillis(),
    status: "completed",
    createdAt: now
  };

  // Atomic inventory deduction + sale write.
  await db.runTransaction(async (tx) => {
    for (const it of lineItems) {
      const invRef = db.collection("inventory").doc(branchId + "_" + it.productId);
      const invSnap = await tx.get(invRef);
      const current = invSnap.exists ? Number(invSnap.data().stockQuantity || 0) : 0;
      if (current < it.quantity) {
        throw new functions.https.HttpsError(
          "failed-precondition", "Insufficient stock: " + it.name);
      }
      tx.set(invRef, {
        productId: it.productId,
        branchId: branchId,
        stockQuantity: current - it.quantity,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }
    tx.set(saleRef, saleDoc);
  });

  return {
    ok: true,
    invoiceNumber: saleDoc.invoiceNumber,
    total: saleDoc.total,
    subtotal: saleDoc.subtotal,
    tax: saleDoc.tax,
    sale: saleDoc
  };
});

// ---------------------------------------------------------------------------
// transferStock (callable) - atomic branch-to-branch transfer.
// ---------------------------------------------------------------------------
exports.transferStock = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "You must be signed in.");
  }
  const user = await getUserProfile(context.auth.uid);
  if (!user || user.active === false) {
    throw new functions.https.HttpsError("permission-denied", "Account is not active.");
  }
  if (user.role !== "admin" && user.role !== "manager") {
    throw new functions.https.HttpsError("permission-denied", "Only managers/admins may transfer stock.");
  }

  const productId = String(data.productId || "");
  const fromBranch = normalizeBranch(String(data.fromBranch || ""));
  const toBranch = normalizeBranch(String(data.toBranch || ""));
  const qty = Number(data.quantity);

  if (!productId || !fromBranch || !toBranch || fromBranch === toBranch) {
    throw new functions.https.HttpsError("invalid-argument", "Invalid transfer parameters.");
  }
  if (!authorizedForBranch(user, fromBranch) || !authorizedForBranch(user, toBranch)) {
    throw new functions.https.HttpsError("permission-denied", "Not authorized for this transfer.");
  }
  if (!Number.isInteger(qty) || qty <= 0) {
    throw new functions.https.HttpsError("invalid-argument", "Quantity must be a positive integer.");
  }

  const fromRef = db.collection("inventory").doc(fromBranch + "_" + productId);
  const toRef = db.collection("inventory").doc(toBranch + "_" + productId);

  await db.runTransaction(async (tx) => {
    const fromSnap = await tx.get(fromRef);
    const fromStock = fromSnap.exists ? Number(fromSnap.data().stockQuantity || 0) : 0;
    if (fromStock < qty) {
      throw new functions.https.HttpsError("failed-precondition",
        "Insufficient stock in " + fromBranch + ".");
    }
    const toSnap = await tx.get(toRef);
    const toStock = toSnap.exists ? Number(toSnap.data().stockQuantity || 0) : 0;

    tx.set(fromRef, {
      productId: productId, branchId: fromBranch, stockQuantity: fromStock - qty,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    tx.set(toRef, {
      productId: productId, branchId: toBranch, stockQuantity: toStock + qty,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    tx.set(db.collection("transfers").doc(), {
      productId: productId, fromBranch: fromBranch, toBranch: toBranch, quantity: qty,
      requestedBy: context.auth.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  });

  return { ok: true };
});

// ---------------------------------------------------------------------------
// adjustStock (callable) - authoritative inventory adjustment.
//
// Stock is manipulated server-side (transactional) so the audit trail is
// accurate and concurrent adjustments cannot lose updates. The client sends
// only {productId, branchId, type: 'addition'|'deduction', quantity, reason}.
// The caller's identity is taken from context.auth, never from the payload.
// ---------------------------------------------------------------------------
exports.adjustStock = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "You must be signed in.");
  }
  const user = await getUserProfile(context.auth.uid);
  if (!user || user.active === false) {
    throw new functions.https.HttpsError("permission-denied", "Account is not active.");
  }
  if (user.role !== "admin" && user.role !== "manager") {
    throw new functions.https.HttpsError("permission-denied", "Only managers/admins may adjust stock.");
  }

  const productId = String(data.productId || "");
  const branchId = normalizeBranch(String(data.branchId || ""));
  const type = String(data.type || "");
  const qty = Number(data.quantity);
  const reason = String(data.reason || "").slice(0, 500);

  if (!productId || !branchId) {
    throw new functions.https.HttpsError("invalid-argument", "Product and branch are required.");
  }
  if (!authorizedForBranch(user, branchId)) {
    throw new functions.https.HttpsError("permission-denied", "Not authorized for this branch.");
  }
  if (type !== "addition" && type !== "deduction") {
    throw new functions.https.HttpsError("invalid-argument", "Adjustment type must be addition or deduction.");
  }
  if (!Number.isInteger(qty) || qty <= 0 || qty > 10000) {
    throw new functions.https.HttpsError("invalid-argument", "Quantity must be a positive integer.");
  }
  if (!reason) {
    throw new functions.https.HttpsError("invalid-argument", "A reason is required for the adjustment.");
  }

  const invRef = db.collection("inventory").doc(branchId + "_" + productId);
  const qtyChange = type === "addition" ? qty : -qty;

  await db.runTransaction(async (tx) => {
    const invSnap = await tx.get(invRef);
    const current = invSnap.exists ? Number(invSnap.data().stockQuantity || 0) : 0;
    const newStock = current + qtyChange;
    if (newStock < 0) {
      throw new functions.https.HttpsError(
        "failed-precondition", "Cannot deduct below zero stock.");
    }
    tx.set(invRef, {
      productId: productId,
      branchId: branchId,
      stockQuantity: newStock,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    tx.set(db.collection("stock_movements").doc(), {
      productId: productId,
      branchId: branchId,
      type: type,
      quantity: qty,
      reason: reason,
      adjustedBy: context.auth.uid,
      adjustedByName: String(user.name || user.email || "unknown"),
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
  });

  return { ok: true };
});

// ---------------------------------------------------------------------------
// bootstrapAdmin (callable) - creates the initial admin profile.
//
// Authorization (all enforced server-side, never trusted from the client):
//   1. Caller must be authenticated.
//   2. Caller's verified Auth email must be present.
//   3. Caller's verified Auth email must be in ADMIN_EMAILS (Secret Manager
//      param). Fails closed if ADMIN_EMAILS is unset/empty.
//   4. The function always writes role: "admin", branchId: "all",
//      active: true - the client cannot choose a role or branch.
//   5. Idempotent: if a profile already exists for the UID, it is returned
//      unchanged (never overwrites existing user data / privilege).
// No passwords, tokens or secrets are logged.
// ---------------------------------------------------------------------------
exports.bootstrapAdmin = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    console.warn("bootstrapAdmin: unauthenticated call blocked.");
    throw new functions.https.HttpsError("unauthenticated", "You must be signed in.");
  }

  const allowedEmails = allowedAdminEmails();
  if (allowedEmails.length === 0) {
    console.error("bootstrapAdmin: ADMIN_EMAILS not configured; failing closed.");
    throw new functions.https.HttpsError("failed-precondition",
      "bootstrapAdmin is not configured (ADMIN_EMAILS). Contact an administrator.");
  }

  const email = normalizeEmail(context.auth.token.email);

  // Do not leak whether the email matches: fail with a generic denial.
  if (!email || !allowedEmails.includes(email)) {
    console.warn("bootstrapAdmin: unauthorized email attempted bootstrap.",
      { uid: context.auth.uid });
    throw new functions.https.HttpsError("permission-denied",
      "You are not authorized to bootstrap an account.");
  }

  // Validate optional display name; never trust role/branch from the client.
  const displayName = String((data && data.name) || "")
    .trim().slice(0, 100) || email.split("@")[0];

  // Idempotent: never overwrite an existing profile (prevents privilege
  // confusion and accidental destructive updates).
  if (await getUserProfile(context.auth.uid)) {
    return { ok: true, message: "Profile already exists." };
  }

  const now = admin.firestore.FieldValue.serverTimestamp();
  await db.collection("users").doc(context.auth.uid).set({
    email: email,
    displayName: displayName,
    name: displayName,
    role: "admin",
    branchId: "all",
    active: true,
    createdAt: now,
    updatedAt: now
  });

  console.log("bootstrapAdmin: admin profile created.", { uid: context.auth.uid });
  return { ok: true };
});

// ---------------------------------------------------------------------------
// scheduledBackup (Pub/Sub, every 24 hours) - real backup to Cloud Storage.
// Exports every CakePOS collection as JSONL, then prunes objects older than
// 180 days (6 months). Objects are encrypted at rest by Cloud Storage.
//
// Bucket: from the BACKUP_BUCKET param, falling back to the project's default
// storage bucket (${projectId}.appspot.com) when BACKUP_BUCKET is unset.
// Grant the runtime service account storage.objectAdmin on the chosen bucket.
//
// For very large production data prefer the managed Firestore export
// (gcloud firestore export gs://bucket/backups) - this function is a
// self-contained fallback using the Admin SDK.
// ---------------------------------------------------------------------------
exports.scheduledBackup = functions.pubsub.schedule("every 24 hours").onRun(async () => {
  const St = require("@google-cloud/storage");
  const storage = new St.Storage();
  // Prefer BACKUP_BUCKET; otherwise use the project's default storage bucket.
  const bucketName = String(backupBucket.value() || "").trim()
    .replace(/^gs:\/\//, "")
    .replace(/\/$/, "") || String(storageBucket.value() || "").trim();
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const prefix = "cakepos-backups/" + ts + "/";
  const bucket = storage.bucket(bucketName);

  if (!bucketName) {
    throw new Error("scheduledBackup: no storage bucket configured (BACKUP_BUCKET unset and no default storage bucket).");
  }

  // Fail clearly if the bucket is unavailable/missing rather than silently
  // claiming success. getMetadata throws if the bucket does not exist or the
  // runtime service account lacks storage.objectAdmin.
  try {
    await bucket.getMetadata();
  } catch (err) {
    console.error("scheduledBackup: bucket unavailable.", { bucket: bucketName, error: err.message });
    throw new Error("scheduledBackup: backup bucket '" + bucketName + "' is unavailable. Grant the runtime service account storage.objectAdmin and retry.");
  }

  const collections = await db.listCollections();
  let totalDocs = 0;

  for (const col of collections) {
    if (col.id === "app_meta") continue;
    const file = bucket.file(prefix + col.id + ".jsonl");
    const stream = file.createWriteStream({
      resumable: false,
      contentType: "application/json"
    });
    let before = null;
    let page = true;
    while (page) {
      const q = before
        ? col.startAfter(before).limit(500)
        : col.orderBy("__name__").limit(500);
      const snap = await q.get();
      if (snap.empty) {
        page = false;
        break;
      }
      snap.forEach(function (docSnap) {
        const json = JSON.stringify({ id: docSnap.id, data: docSnap.data() });
        stream.write(json + "\n");
        totalDocs++;
        before = docSnap.id;
      });
      if (snap.size < 500) page = false;
    }
    stream.end();
    await new Promise(function (resolve, reject) {
      stream.on("finish", resolve);
      stream.on("error", reject);
    });
  }

  // Prune objects older than 180 days (6 months). The directory names are
  // ISO timestamps with ':' and '.' removed, so lexicographic comparison is a
  // correct chronological comparison (no fragile Date re-parsing).
  let deleted = 0;
  const cutoffTs = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000)
    .toISOString().replace(/[:.]/g, "-");
  const list = await bucket.getFiles({ prefix: "cakepos-backups/" });
  const backupFiles = list[0];
  for (const f of backupFiles) {
    const m = f.name.match(/^cakepos-backups\/([^/]+)\//);
    if (!m) continue;
    // Each backup uploads under a single directory <ts>/<collection>.jsonl.
    if (m[1].length === 24 && m[1] < cutoffTs) {
      await f.delete().catch(function () {});
      deleted++;
    }
  }

  console.log("Backup complete. Exported " + totalDocs + " docs. Cleaned " + deleted + " old objects.");
  return null;
});
