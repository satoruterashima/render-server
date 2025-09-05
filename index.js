// render-server/index.js — safe baseline + GAS relay

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

// ===== API routes =====

// /api/categories: GAS の getCategories を中継し、フロントが使いやすい形にそろえて返す
app.get("/api/categories", async (_req, res) => {
  try {
    const rows = await gasGet({ action: "getCategories" }); // [[大,中,小,価格,画像], ...] を想定
    // rows が配列なら配列、{ok,items} なら items を採用
    const raw = Array.isArray(rows)
      ? rows
      : (rows && Array.isArray(rows.items))
        ? rows.items
        : [];

    const items = raw
      .map((r, i) => {
        const a = Array.isArray(r);
        const major = a ? String(r[0] || "") : String(r.major || "");
        const mid   = a ? String(r[1] || "") : String(r.mid   || "");
        const name  = a ? String(r[2] || "") : String(r.name  || "");
        const price = a ? Number(r[3] || 0)  : Number(r.price || 0);
        const image = a ? String(r[4] || "") : String(r.image || "");
        return { id: `itm_${i}`, major, mid, name, price, image };
      })
      .filter(x => x.major && x.mid && x.name);

    return res.json({ ok: true, items });
  } catch (e) {
    console.error("getCategories upstream error:", e);
    return res.status(502).json({ ok: false, error: "getCategories failed" });
  }
});

// ===== static files (順序が超重要：SPAより先) =====
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
app.use(express.static(BUILD_DIR)); // index.html, asset-manifest.json など

// ===== SPA fallback (最後) =====
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api") || req.path.startsWith("/__")) return next();
  res.sendFile(path.join(BUILD_DIR, "index.html"));
});

// error handler + crash logs
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

// ===== /api/order: フロント→GAS placeOrder を中継 =====
app.post("/api/order", async (req, res) => {
  try {
    const body = req.body || {};
    // 最低限のバリデーション
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return res.status(400).json({ ok:false, error:"items is empty" });
    }

    // 合計計算（サーバ側でもチェック）
    const total = body.items.reduce((s, it) => s + Number(it.price||0) * Number(it.qty||0), 0);

    // GAS に渡すペイロード
    const payload = {
      action: "placeOrder",
      userId: body.liffUserId || "",  // LIFFの userId（なくても可）
      items: body.items,               // [{name, price, qty, major, mid}]
      note: body.note || "",
      total
    };

    // ---- GAS リクエスト ----
    const url = new URL(GAS_URL);
    const r = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const text = await r.text().catch(() => "");
    if (!r.ok) {
      console.error("GAS POST placeOrder failed:", r.status, text.slice(0,200));
      return res.status(502).json({ ok:false, error:`upstream ${r.status}` });
    }

    let j;
    try { j = JSON.parse(text); } catch (e) {
      console.error("GAS JSON parse error:", e, text.slice(0,200));
      return res.status(502).json({ ok:false, error:"invalid upstream json" });
    }
    if (!j || j.ok !== true) {
      console.error("GAS returned not ok:", j);
      return res.status(502).json({ ok:false, error:"upstream not ok", detail:j });
    }

    return res.json({ ok:true, orderId: j.orderId, total });
  } catch (e) {
    console.error("order failed:", e);
    return res.status(500).json({ ok:false, error:String(e) });
  }
});
