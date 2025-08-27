import express from "express";
import multer from "multer";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();
const app = express();
const upload = multer({ storage: multer.memoryStorage() });
app.use(express.json());

app.post("/api/categories/upload", upload.single("file"), async (req, res) => {
  const { daibun, chubun, shobun, price, action } = req.body;
  const file = req.file;
  if (!file || action !== "add") return res.status(400).json({ error: "画像必須" });

  const base64Image = file.buffer.toString("base64");

  const gasRes = await fetch(process.env.GAS_URL, {
    method: "POST",
    body: JSON.stringify({ action: "uploadImage", daibun, chubun, shobun, price, base64Image, fileName: file.originalname }),
    headers: { "Content-Type": "application/json" }
  });

  const result = await gasRes.json();
  res.json(result);
});

app.listen(process.env.PORT || 3000, () => console.log("Render server running"));
