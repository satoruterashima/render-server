// render-server/index.js — POS + Admin API (GAS relay) + static hosting

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

// noisy request logger
app.use((req, _res, next) => {
  console.log(`[REQ] ${req.method} ${req.originalUrl}`);
  next();
});

// health & ping
app.get("/api/healthz", (_req, res) => res.status(200).json({ ok: true }));
app.get("/__ping", (_req, res) => res.type("text").send(`OK ${new Date().toISOString()}`));

// ===== GAS relay helpers =====
const GAS_URL = process.env.GAS_URL || ""; // 例: https://script.google.com/macros/s/XXXX/exec

async function gasGet(params) {
  if (!GAS_URL) throw new Error("GAS_URL is empty");
  const url = new URL(GAS_URL);
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  });
  const r = await fetch(url.toString(), { method: "GET" });
  const text = await r.text().catch(() => "");
  if (!r.ok) {
    console.error("GAS GET failed:", r.status, text.slice(0, 300));
    throw new Error(`GAS GET ${params?.action} ${r.status}`);
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    console.error("GAS JSON parse error:", e, text.slice(0, 300));
    throw e;
  }
}

async function gasPost(body) {
  if (!GAS_URL) throw new Error("GAS_URL is empty");
  const r = await fetch(GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  const text = await r.text().catch(() => "");
  if (!r.ok) {
    console.error("GAS POST failed:", r.status, text.slice(0, 300));
    throw new Error(`GAS POST ${body?.action} ${r.status}`);
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    console.error("GAS JSON parse error:", e, text.slice(0, 300));
    throw e;
  }
}

// ===== POS APIs =====
import fetch from 'node-fetch';

const GAS = process.env.GAS_BASE_URL;
const FETCH_TIMEOUT_MS = 15000;

app.get('/api/categories', async (req, res) => {
  const url = `${GAS}?action=getCategories`;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);

    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);

    const text = await r.text();
    let j;
    try { j = JSON.parse(text); } catch {
      console.error('[categories] non-JSON from GAS:', text);
      return res.status(502).json({ ok:false, error:'bad_upstream_format' });
    }

    if (!r.ok || j.ok === false) {
      console.error('[categories] upstream error', { status:r.status, body:j });
      return res.status(502).json({ ok:false, error:'upstream_error', detail:j });
    }
    return res.json(j);
  } catch (err) {
    console.error('[categories] fetch failed', err);
    return res.status(502).json({ ok:false, error:'fetch_failed' });
  }
});

app.post('/api/admins/is-admin', express.json(), async (req, res) => {
  try {
    const r = await fetch(process.env.GAS_BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action:'isAdmin', userId: req.body.userId })
    });
    const j = await r.json();
    if (!r.ok || j.ok === false) return res.status(502).json({ ok:false, error:'upstream_error', detail:j });
    res.json(j);
  } catch (e) {
    console.error('[is-admin] failed', e);
    res.status(502).json({ ok:false, error:'fetch_failed' });
  }
});

app.post('/api/admins/register', express.json(), async (req, res) => {
  try {
    const r = await fetch(process.env.GAS_BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action:'registerAdmin', userId: req.body.userId, displayName: req.body.displayName })
    });
    const j = await r.json();
    if (!r.ok || j.ok === false) return res.status(502).json({ ok:false, error:'upstream_error', detail:j });
    res.json(j);
  } catch (e) {
    console.error('[register-admin] failed', e);
    res.status(502).json({ ok:false, error:'fetch_failed' });
  }
});


app.post("/api/order", async (req, res) => {
  try {
    const body = req.body || {};
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return res.status(400).json({ ok:false, error:"items is empty" });
    }
    const total = body.items.reduce((s, it) => s + Number(it.price||0) * Number(it.qty||0), 0);
    const payload = {
      action: "placeOrder",
      userId: body.liffUserId || "",
      items: body.items,
      note: body.note || "",
      total
    };
    const j = await gasPost(payload);
    if (!j || j.ok !== true) return res.status(502).json({ ok:false, error:"upstream not ok", detail:j });
    return res.json({ ok:true, orderId: j.orderId, total });
  } catch (e) {
    console.error("order failed:", e);
    return res.status(500).json({ ok:false, error:String(e) });
  }
});

// ===== Admin APIs =====

// 起動時にユーザーを記録（既存/新規はGAS側で吸収）
app.get("/api/recordUser", async (req, res) => {
  try {
    const { userId, displayName } = req.query;
    const j = await gasGet({ action: "recordUser", userId, displayName });
    return res.json(j);
  } catch (e) {
    console.error("recordUser failed:", e);
    return res.status(502).json({ ok:false, error:"recordUser failed" });
  }
});

// 初回管理者が存在するか
app.get("/api/checkFirstAdmin", async (_req, res) => {
  try {
    const j = await gasGet({ action: "checkFirstAdmin" });
    return res.json(j);
  } catch (e) {
    console.error("checkFirstAdmin failed:", e);
    return res.status(502).json({ ok:false, error:"checkFirstAdmin failed" });
  }
});

// 自分が管理者か
app.get("/api/checkAdmin", async (req, res) => {
  try {
    const { userId } = req.query;
    const j = await gasGet({ action: "checkAdmin", userId });
    return res.json(j);
  } catch (e) {
    console.error("checkAdmin failed:", e);
    return res.status(502).json({ ok:false, error:"checkAdmin failed" });
  }
});

// 管理者一覧
app.get("/api/admins", async (_req, res) => {
  try {
    const j = await gasGet({ action: "getAdmins" });
    return res.json(j);
  } catch (e) {
    console.error("getAdmins failed:", e);
    return res.status(502).json({ ok:false, error:"getAdmins failed" });
  }
});

// ユーザー一覧（アプリを一度開いた人）
app.get("/api/users", async (_req, res) => {
  try {
    const j = await gasGet({ action: "getUsers" });
    return res.json(j);
  } catch (e) {
    console.error("getUsers failed:", e);
    return res.status(502).json({ ok:false, error:"getUsers failed" });
  }
});

// 初回管理者に自分を登録
app.post("/api/registerFirstAdmin", async (req, res) => {
  try {
    const { userId, displayName } = req.body || {};
    const j = await gasPost({ action: "registerFirstAdmin", userId, displayName });
    return res.json(j);
  } catch (e) {
    console.error("registerFirstAdmin failed:", e);
    return res.status(502).json({ ok:false, error:"registerFirstAdmin failed" });
  }
});

// 既存管理者が他ユーザーを追加/削除
app.post("/api/admins/add", async (req, res) => {
  try {
    const { targetUserId } = req.body || {};
    const j = await gasPost({ action: "addAdmin", userId: targetUserId });
    return res.json(j);
  } catch (e) {
    console.error("addAdmin failed:", e);
    return res.status(502).json({ ok:false, error:"addAdmin failed" });
  }
});
app.post("/api/admins/remove", async (req, res) => {
  try {
    const { targetUserId } = req.body || {};
    const j = await gasPost({ action: "removeAdmin", userId: targetUserId });
    return res.json(j);
  } catch (e) {
    console.error("removeAdmin failed:", e);
    return res.status(502).json({ ok:false, error:"removeAdmin failed" });
  }
});

// ===== static files =====
const BUILD_DIR = path.join(__dirname, "build");
try {
  const st = fs.statSync(BUILD_DIR);
  console.log("[BOOT] build dir:", BUILD_DIR, "exists:", st.isDirectory());
  const list = fs.readdirSync(BUILD_DIR);
  console.log("[BOOT] build files:", list);
} catch (e) {
  console.error("[BOOT] build dir not found:", BUILD_DIR, e);
}

app.use("/static", express.static(path.join(BUILD_DIR, "static"), {
  immutable: true, maxAge: "1y",
}));
app.use(express.static(BUILD_DIR));

// ===== SPA fallback (最後) =====
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

// 生の getCategories を返して中身を確認する用（デバッグ）
app.get("/api/_debug/raw-categories", async (_req, res) => {
  try {
    const raw = await gasGet({ action: "getCategories" });
    res.json({ raw });
  } catch (e) {
    console.error("debug raw-categories failed:", e);
    res.status(502).json({ ok:false, error:String(e) });
  }
});

// いまの GAS_URL を確認（先頭だけ表示）
app.get("/api/_debug/env", (_req, res) => {
  const u = process.env.GAS_URL || "";
  res.json({ GAS_URL_head: u.slice(0, 40) + (u.length>40 ? "..." : "") });
});

import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, '..', 'build'))); // ← build を配信

app.get('/healthz', (req, res) => res.json({ ok:true, ts: Date.now() }));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'build', 'index.html'));
});
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';

const app = express();
// ...（APIのルーティングが上にある想定）

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// React のビルド成果物を配信
app.use(express.static(path.join(__dirname, '..', 'client', 'build')));

// ヘルスチェック（任意）
app.get('/healthz', (_req, res) => res.json({ ok: true, ts: Date.now() }));

// SPA ルーティング
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'build', 'index.html'));
});
