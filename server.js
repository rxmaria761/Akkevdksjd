const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const AdmZip = require("adm-zip");

const API_BASE = "https://mirai-store.vercel.app";
const PASTEBIN_API = "https://pastebin-api.vercel.app";
const PORT = process.env.PORT || 3000;

const UPLOAD_DIR = path.join(__dirname, "uploads");
const UNZIP_DIR = path.join(__dirname, "unzipped");

for (const d of [UPLOAD_DIR, UNZIP_DIR]) {
  if (!fs.existsSync(d)) fs.mkdirSync(d);
}

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const upload = multer({ dest: UPLOAD_DIR });

app.get("/", (req, res) => {
  res.send(`<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>MiraiStore ZIP Uploader</title>
</head>
<body>
<h2>MiraiStore Bulk ZIP Upload</h2>
<form method="POST" action="/upload" enctype="multipart/form-data">
<input type="file" name="zip" accept=".zip" required>
<button type="submit">Upload ZIP</button>
</form>
</body>
</html>`);
});

app.post("/upload", upload.single("zip"), async (req, res) => {
  try {
    if (!req.file) return res.send("❌ No ZIP uploaded");

    fs.rmSync(UNZIP_DIR, { recursive: true, force: true });
    fs.mkdirSync(UNZIP_DIR);

    const zip = new AdmZip(req.file.path);
    zip.extractAllTo(UNZIP_DIR, true);

    const files = fs.readdirSync(UNZIP_DIR).filter(f => f.endsWith(".js"));
    let success = 0, failed = 0;
    const logs = [];

    for (const file of files) {
      const fullPath = path.join(UNZIP_DIR, file);
      try {
        const data = fs.readFileSync(fullPath, "utf8");
        if (data.trim().startsWith("<")) { failed++; logs.push(`HTML skipped: ${file}`); continue; }
        try { new Function(data); } catch { failed++; logs.push(`Syntax error: ${file}`); continue; }

        const pasteRes = await axios.post(`${PASTEBIN_API}/paste`, { text: data });
        if (!pasteRes.data?.id) { failed++; logs.push(`Pastebin failed: ${file}`); continue; }
        const rawUrl = `${PASTEBIN_API}/raw/${pasteRes.data.id}`;

        const storeRes = await axios.post(`${API_BASE}/miraistore/upload`, { rawUrl });
        if (storeRes.data?.error) { failed++; logs.push(`Store error: ${file}`); continue; }

        success++; logs.push(`OK: ${file}`);

      } catch (e) { failed++; logs.push(`Fail: ${file}`); }
    }

    res.send(`DONE<br>Success: ${success}<br>Failed: ${failed}<pre>${logs.join("\n")}</pre>`);

  } catch (e) { res.send("Fatal Error: " + e.message); }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
