// render-server/index.js — クリーン版

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

// ================= HMAC 署名（GAS連携） =================
function signPayload(action, ts, userId = "") {
  const base = `${action}.${ts}.${userId}`;
  const h = crypto.createHmac("sha256", process.env.GAS_SHARED_SECRET || "");
  h.update(base);                 // ★ 必須：ベース文字列を流す
  return h.digest("hex");
}

async function gasGet(params) {
  const ts = Math.floor(Date.now() / 1000);
  const sig = signPayload(params.action, ts, params.userId || "");
  const url = new URL(process.env.GAS_URL);
  Object.entries({ ...params, ts, sig }).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  });
  const r = await fetch(url.toString(), { method: "GET" });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    console.error("GAS GET failed:", params.action, r.status, text); // ★ 失敗詳細ログ
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
    console.error("GAS POST failed:", body.action, r.status, text);   // ★ 失敗詳細ログ
    throw new Error(`GAS POST ${body.action} ${r.status}`);
  }
  return r.json();
}

// ================= ヘルスチェック =================
app.get("/api/healthz", (_req, res) => res.status(200).json({ ok: true }));

// ================= API ルート =================
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

app.get("/api/categories", async (_req, res) => {
  try {
    const data = await gasGet({ action: "getCategories" });
    res.json(data);
  } catch (e) {
    console.error("getCategories upstream error:", e);
    res.status(502).json({ error: "getCategories failed" });
  }
});

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

// ================= 静的ファイル配信（/api の“後ろ”） =================
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
