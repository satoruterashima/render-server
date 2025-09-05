﻿// render-server/index.js — safe baseline

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

// --- noisy request logger (必ず最初に) ---
app.use((req, _res, next) => {
  console.log(`[REQ] ${req.method} ${req.originalUrl}`);
  next();
});

// --- health & ping (これで生存確認できる) ---
app.get("/api/healthz", (_req, res) => res.status(200).json({ ok: true }));
app.get("/__ping", (_req, res) => res.type("text").send(`OK ${new Date().toISOString()}`));

// --- build の存在確認 & 一覧ダンプ ---
const BUILD_DIR = path.join(__dirname, "build");
try {
  const st = fs.statSync(BUILD_DIR);
  console.log("[BOOT] build dir:", BUILD_DIR, "exists:", st.isDirectory());
  const list = fs.readdirSync(BUILD_DIR);
  console.log("[BOOT] build files:", list);
} catch (e) {
  console.error("[BOOT] build dir not found:", BUILD_DIR, e);
}

// --- 静的配信（順序が超重要：SPAフォールバックより“先”） ---
app.use("/static", express.static(path.join(BUILD_DIR, "static"), {
  immutable: true, maxAge: "1y",
}));
app.use(express.static(BUILD_DIR)); // index.html, asset-manifest.json など

// --- SPA フォールバック（最後！/api や /__ は除外） ---
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api") || req.path.startsWith("/__")) return next();
  res.sendFile(path.join(BUILD_DIR, "index.html"));
});

// --- エラーハンドラ（ログを必ず見る） ---
app.use((err, _req, res, _next) => {
  console.error("[ERR]", err);
  res.status(500).json({ ok: false, error: String(err) });
});

// --- 未捕捉例外のログ ---
process.on("unhandledRejection", (e) => { console.error("[UNHANDLED_REJECTION]", e); });
process.on("uncaughtException", (e) => { console.error("[UNCAUGHT_EXCEPTION]", e); });

// --- 起動 ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server started on :${PORT}`);
});