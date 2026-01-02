const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

const API_BASE = "https://mirai-store.vercel.app";
const PASTEBIN_API = "https://pastebin-api.vercel.app";
const PORT = process.env.PORT || 3000;

const UPLOAD_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ===== Multer setup for multiple JS files =====
const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB max per file
});

// ===== Home page =====
app.get("/", (req, res) => {
  res.send(`<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>MiraiStore JS Upload</title>
</head>
<body>
<h2>Upload Multiple JS Files to MiraiStore</h2>
<form method="POST" action="/upload" enctype="multipart/form-data">
<input type="file" name="jsfiles" accept=".js" multiple required />
<button type="submit">Upload JS Files</button>
</form>
</body>
</html>`);
});

// ===== Upload route =====
app.post("/upload", upload.array("jsfiles"), async (req, res) => {
  if (!req.files || !req.files.length) return res.send("❌ No JS files uploaded");

  let success = 0, failed = 0;
  const logs = [];

  for (const file of req.files) {
    const fullPath = file.path;
    try {
      const data = fs.readFileSync(fullPath, "utf8");

      // syntax check
      try { new Function(data); } catch { failed++; logs.push(`Syntax error: ${file.originalname}`); continue; }

      // Pastebin upload
      const pasteRes = await axios.post(`${PASTEBIN_API}/paste`, { text: data });
      if (!pasteRes.data?.id) { failed++; logs.push(`Pastebin failed: ${file.originalname}`); continue; }
      const rawUrl = `${PASTEBIN_API}/raw/${pasteRes.data.id}`;

      // Miraistore registration
      const storeRes = await axios.post(`${API_BASE}/miraistore/upload`, { rawUrl });
      if (storeRes.data?.error) { failed++; logs.push(`Store error: ${file.originalname}`); continue; }

      success++; logs.push(`OK: ${file.originalname}`);
    } catch (e) {
      failed++; logs.push(`Fail: ${file.originalname}`);
    }
    // remove temp file
    fs.unlinkSync(fullPath);
  }

  res.send(`DONE<br>Success: ${success}<br>Failed: ${failed}<pre>${logs.join("\n")}</pre>`);
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
