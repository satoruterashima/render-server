// render-server/index.js — clean ESM server (POS + Admin API + static hosting)

import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ===== env & helpers =====
const GAS_BASE_URL = process.env.GAS_BASE_URL || process.env.GAS_URL || ""; // accept either
const FETCH_TIMEOUT_MS = 15000;

// noisy request logger
app.use((req, _res, next) => {
  console.log(`[REQ] ${req.method} ${req.originalUrl}`);
  next();
});

// health
app.get("/healthz", (_req, res) => res.status(200).json({ ok: true, ts: Date.now() }));
app.get("/api/healthz", (_req, res) => res.status(200).json({ ok: true }));

// ---- GAS relay (Node20 has global fetch) ----
async function gasGet(params) {
  if (!GAS_BASE_URL) throw new Error("GAS_BASE_URL is empty");
  const url = new URL(GAS_BASE_URL);
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  const r = await fetch(url.toString(), { method: "GET", signal: ctrl.signal });
  clearTimeout(timer);
  const text = await r.text().catch(() => "");
  if (!r.ok) {
    console.error("GAS GET failed:", r.status, text.slice(0, 300));
    throw new Error(`GAS GET ${params?.action} ${r.status}`);
  }
  try { return JSON.parse(text); }
  catch (e) { console.error("GAS JSON parse error:", e, text.slice(0, 300)); throw e; }
}

async function gasPost(body) {
  if (!GAS_BASE_URL) throw new Error("GAS_BASE_URL is empty");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  const r = await fetch(GAS_BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: ctrl.signal,
    body: JSON.stringify(body || {}),
  });
  clearTimeout(timer);
  const text = await r.text().catch(() => "");
  if (!r.ok) {
    console.error("GAS POST failed:", r.status, text.slice(0, 300));
    throw new Error(`GAS POST ${body?.action} ${r.status}`);
  }
  try { return JSON.parse(text); }
  catch (e) { console.error("GAS JSON parse error:", e, text.slice(0, 300)); throw e; }
}

// ---- POS APIs ----
async function fetchCategoriesUpstream() {
  // まず V2 を試し、ダメなら旧 API にフォールバック
  const tryActions = ["getCategoriesV2", "getCategories"];
  for (const action of tryActions) {
    try {
      const j = await gasGet({ action });
      if (j && Array.isArray(j.items)) return j;
      // 旧実装が配列そのものを返す場合に合わせる
      if (Array.isArray(j)) return { ok: true, items: j };
      if (j && j.ok === true) return j;
    } catch (e) {
      console.warn(`[categories] upstream ${action} failed:`, String(e));
    }
  }
  throw new Error("both getCategoriesV2/getCategories failed");
}

app.get("/api/categories", async (_req, res) => {
  try {
    const j = await fetchCategoriesUpstream();
    return res.json({ ok: true, items: j.items || [] });
  } catch (err) {
    console.error("[categories] fetch failed", err);
    return res.status(502).json({ ok: false, error: "fetch_failed" });
  }
});

app.post("/api/order", async (req, res) => {
  try {
    const body = req.body || {};
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return res.status(400).json({ ok: false, error: "items is empty" });
    }
    const total = body.items.reduce((s, it) => s + Number(it.price || 0) * Number(it.qty || 0), 0);
    const payload = {
      action: "placeOrder",
      userId: body.liffUserId || "",
      items: body.items,
      note: body.note || "",
      total,
    };
    const j = await gasPost(payload);
    if (!j || j.ok !== true) return res.status(502).json({ ok: false, error: "upstream not ok", detail: j });
    return res.json({ ok: true, orderId: j.orderId, total });
  } catch (e) {
    console.error("order failed:", e);
    return res.status(500).json({ ok: false, error: String(e) });
  }
});

// ---- Admin APIs (必要分のみ保持。不要なら削ってOK) ----
app.get("/api/recordUser", async (req, res) => {
  try {
    const { userId, displayName } = req.query;
    const j = await gasGet({ action: "recordUser", userId, displayName });
    return res.json(j);
  } catch (e) {
    console.error("recordUser failed:", e);
    return res.status(502).json({ ok: false, error: "recordUser failed" });
  }
});

app.get("/api/checkFirstAdmin", async (_req, res) => {
  try {
    const j = await gasGet({ action: "checkFirstAdmin" });
    return res.json(j);
  } catch (e) {
    console.error("checkFirstAdmin failed:", e);
    return res.status(502).json({ ok: false, error: "checkFirstAdmin failed" });
  }
});

app.get("/api/checkAdmin", async (req, res) => {
  try {
    const { userId } = req.query;
    const j = await gasGet({ action: "checkAdmin", userId });
    return res.json(j);
  } catch (e) {
    console.error("checkAdmin failed:", e);
    return res.status(502).json({ ok: false, error: "checkAdmin failed" });
  }
});

app.get("/api/admins", async (_req, res) => {
  try {
    const j = await gasGet({ action: "getAdmins" });
    return res.json(j);
  } catch (e) {
    console.error("getAdmins failed:", e);
    return res.status(502).json({ ok: false, error: "getAdmins failed" });
  }
});

app.get("/api/users", async (_req, res) => {
  try {
    const j = await gasGet({ action: "getUsers" });
    return res.json(j);
  } catch (e) {
    console.error("getUsers failed:", e);
    return res.status(502).json({ ok: false, error: "getUsers failed" });
  }
});

app.post("/api/registerFirstAdmin", async (req, res) => {
  try {
    const { userId, displayName } = req.body || {};
    const j = await gasPost({ action: "registerFirstAdmin", userId, displayName });
    return res.json(j);
  } catch (e) {
    console.error("registerFirstAdmin failed:", e);
    return res.status(502).json({ ok: false, error: "registerFirstAdmin failed" });
  }
});

app.post("/api/admins/add", async (req, res) => {
  try {
    const { targetUserId } = req.body || {};
    const j = await gasPost({ action: "addAdmin", userId: targetUserId });
    return res.json(j);
  } catch (e) {
    console.error("addAdmin failed:", e);
    return res.status(502).json({ ok: false, error: "addAdmin failed" });
  }
});

app.post("/api/admins/remove", async (req, res) => {
  try {
    const { targetUserId } = req.body || {};
    const j = await gasPost({ action: "removeAdmin", userId: targetUserId });
    return res.json(j);
  } catch (e) {
    console.error("removeAdmin failed:", e);
    return res.status(502).json({ ok: false, error: "removeAdmin failed" });
  }
});

// ---- debug ----
app.get("/api/_debug/raw-categories", async (_req, res) => {
  try {
    const raw = await gasGet({ action: "getCategories" });
    res.json({ raw });
  } catch (e) {
    console.error("debug raw-categories failed:", e);
    res.status(502).json({ ok: false, error: String(e) });
  }
});

app.get("/api/_debug/env", (_req, res) => {
  const u = GAS_BASE_URL || "";
  res.json({ GAS_BASE_URL_head: u.slice(0, 40) + (u.length > 40 ? "..." : "") });
});

// ---- static files (root ./build) ----
const BUILD_DIR = path.join(__dirname, "build");
try {
  const st = fs.statSync(BUILD_DIR);
  console.log("[BOOT] build dir:", BUILD_DIR, "exists:", st.isDirectory());
  const list = fs.readdirSync(BUILD_DIR);
  console.log("[BOOT] build files:", list);
} catch (e) {
  console.error("[BOOT] build dir not found:", BUILD_DIR, e);
}

app.use("/static", express.static(path.join(BUILD_DIR, "static"), { immutable: true, maxAge: "1y" }));
app.use(express.static(BUILD_DIR));

// SPA fallback (最後)
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api") || req.path.startsWith("/__")) return next();
  res.sendFile(path.join(BUILD_DIR, "index.html"));
});

// error/crash logs
app.use((err, _req, res, _next) => {
  console.error("[ERR]", err);
  res.status(500).json({ ok: false, error: String(err) });
});
process.on("unhandledRejection", (e) => { console.error("[UNHANDLED_REJECTION]", e); });
process.on("uncaughtException", (e) => { console.error("[UNCAUGHT_EXCEPTION]", e); });

// start
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server started on :${PORT}`);
});
