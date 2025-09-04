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
  h.update(base); // ←必須
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
    c
