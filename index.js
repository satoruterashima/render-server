// render-server/index.js

import express from "express";
import fetch from "node-fetch";
import crypto from "crypto";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// __dirname（ESM）
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ================= HMAC署名 =================
function signPayload(action, ts, userId = "") {
  const base = `${action}.${ts}.${userId}`;
  const h = crypto.createHmac("sha256", process.env.GAS_SHARED_SECRET || "");
  h.update(base); // 重要
  return h.digest("hex");
}

// ================= GAS呼び出し共通 =================
async function gasGet(params) {
  const ts = Math.floor(Date.now() / 1000);
  const sig = signPayload(params.action, ts, params.userId || "");
  const url = new URL(process.env.GAS_URL);
  Object.entries({ ...params, ts, sig }).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  });
  const finalUrl = url.toString();
  const r = await fetch(finalUrl, { method: "GET" });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    console.error("GAS GET failed:", params.action, r.status, "URL:", finalUrl, "BODY:", text);
    throw new Error(`GAS GET ${params.action} ${r.status}`);
  }
  return r.json();
}

async function gasPost(body) {
  const ts = Math.floor(Date.now() / 1000);
  const sig = signPayload(body.action, ts, body.userId || "");
  const url = new URL(process.env.GAS_URL);
  url.searchParams.set("ts", String(ts));
  url.searchParams.set("sig", sig);
  if (body.userId) url.searchParams.set("userId", body.userId);
  const r = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    console.error("GAS POST failed:", body.action, r.status, "BODY:", text);
    throw new Error(`GAS POST ${body.action} ${r.status}`);
  }
  return r.json();
}

// ================= 起動時ログ =================
console.log("[BOOT] starting server", {
  hasGAS_URL: !!process.env.GAS_URL,
  GAS_URL: process.env.GAS_URL,
  hasSecret: !!process.env.GAS_SHARED_SECRET,
  SIG_TTL: process.env.SIG_TTL,
});

// ================= API共通ログ =================
app.use((req, _res, next) => {
  if (req.path.startsWith("/api")) {
    console.log("[API]", req.method, req.originalUrl);
  }
  next();
});

// ================= ヘルスチェック =================
app.get("/api/healthz", (_req, res) => res.status(200).json({ ok: true }));

// ================= GAS 疎通テスト =================
app.get("/api/ping-gas", async (_req, res) => {
  try {
    const j = await gasGet({ action: "poke" });
    console.log("[PING] GAS poke ok:", j);
    res.json({ ok: true, gas: j });
  } catch (e) {
    console.error("[PING] GAS poke failed:", e);
    res.status(502).json({ ok: false, error: String(e) });
  }
});

// ================= 設定確認エンドポイント =================
app.get("/api/debug-config", (_req, res) => {
  res.json({
    hasGAS_URL: !!process.env.GAS_URL,
    GAS_URL: process.env.GAS_URL || null,
    hasSecret: !!process.env.GAS_SHARED_SECRET,
    SIG_TTL: process.env.SIG_TTL || null,
  });
});

// ================= 管理系API（必要に応じて利用） =================
app.get("/api/checkAdmin", async (req, res) => {
  try {
    const data = await gasGet({ action: "checkAdmin", userId: req.query.userId });
    res.json(data);
  } catch (e) { console.error(e); res.status(502).json({ error: "checkAdmin failed" }); }
});

app.get("/api/checkFirstAdmin", async (_req, res) => {
  try {
    const data = await gasGet({ action: "checkFirstAdmin" });
    res.json(data);
  } catch (e) { console.error(e); res.status(502).json({ error: "checkFirstAdmin failed" }); }
});

app.post("/api/registerFirstAdmin", async (req, res) => {
  try {
    const data = await gasPost({
      action: "registerFirstAdmin",
      userId: req.query.userId,
      displayName: req.query.displayName,
    });
    res.json(data);
  } catch (e) { console.error(e); res.status(502).json({ error: "registerFirstAdmin failed" }); }
});

app.get("/api/recordUser", async (req, res) => {
  try {
    const data = await gasGet({
      action: "recordUser",
      userId: req.query.userId,
      displayName: req.query.displayName,
    });
    res.json(data);
  } catch (e) { console.error(e); res.status(502).json({ error: "recordUser failed" }); }
});

app.get("/api/admins", async (_req, res) => {
  try {
    const data = await gasGet({ action: "getAdmins" });
    res.json(data);
  } catch (e) { console.error(e); res.status(502).json({ error: "getAdmins failed" }); }
});

app.post("/api/admins/add", async (req, res) => {
  try {
    const data = await gasPost({ action: "addAdmin", userId: req.body.userId });
    res.json(data);
  } catch (e) { console.error(e); res.status(502).json({ error: "addAdmin failed" }); }
});

app.post("/api/admins/remove", async (req, res) => {
  try {
    const data = await gasPost({ action: "removeAdmin", userId: req.body.userId });
    res.json(data);
  } catch (e) { console.error(e); res.status(502).json({ error: "removeAdmin failed" }); }
});

app.get("/api/users", async (_req, res) => {
  try {
    const data = await gasGet({ action: "getUsers" });
    res.json(data);
  } catch (e) { console.error(e); res.status(502).json({ error: "getUsers failed" }); }
});

// ================= 注文メニュー（カテゴリ） =================
// GASの行配列 [[大,中,小(商品名),価格,画像URL], ...] → { ok:true, items:[...] } に整形して返す
app.get("/api/categories", async (_req, res) => {
  try {
    const rows = await gasGet({ action: "getCategories" });
    const items = (Array.isArray(rows) ? rows : [])
      .filter(r => Array.isArray(r) && r[0])
      .map((r, i) => ({
        id: `itm_${i}`,
        major: String(r[0] || ""),
        mid: String(r[1] || ""),
        name: String(r[2] || ""),
        price: Number(r[3] || 0),
        image: String(r[4] || ""),
      }));
    res.json({ ok: true, items });
  } catch (e) {
    console.error("getCategories upstream error:", e);
    res.status(502).json({ ok: false, error: "getCategories failed" });
  }
});

// ================= 受注 =================
app.post("/api/order", async (req, res) => {
  try {
    const data = await gasPost({
      action: "placeOrder",
      userId: req.body.liffUserId,
      items: req.body.items,
      note: req.body.note,
    });
    res.json(data);
  } catch (e) { console.error(e); res.status(502).json({ error: "order failed" }); }
});

// ================= 静的ファイル配信（SPA） =================
app.use(express.static(path.join(__dirname, "build")));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  res.sendFile(path.join(__dirname, "build", "index.html"));
});

// ================= 起動 =================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server started on :${PORT}`);
});
