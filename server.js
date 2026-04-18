const express = require('express');
const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Uploads live OUTSIDE public/ so express.static cannot serve them.
// The only way to reach bytes is via /api/download/:token.
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Startup: in-memory state is empty after a restart, so every file on disk
// is an orphan from the previous process. Wipe them.
try {
  for (const f of fs.readdirSync(UPLOADS_DIR)) {
    fs.unlinkSync(path.join(UPLOADS_DIR, f));
  }
  console.log('[Startup] Cleared orphan uploads');
} catch (err) {
  console.error('[Startup] Failed to clear uploads:', err);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50 MB
});

// Map<Code, { type, content(filename), originalName, size, visitsLeft, lastAccessed }>
const clipboards = new Map();
// Map<token, { filename, originalName, expires }>
const downloadTokens = new Map();

const TOKEN_TTL_MS = 5 * 60 * 1000;
const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;
const NEW_FILE_GRACE_MS = 10 * 60 * 1000;
const REAP_INTERVAL_MS = 5 * 60 * 1000;

const CODE_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const generateCode = () => {
  const bytes = crypto.randomBytes(4);
  let result = '';
  for (let i = 0; i < 4; i++) result += CODE_CHARS[bytes[i] % CODE_CHARS.length];
  return result;
};

const issueDownloadToken = (item) => {
  const token = crypto.randomBytes(16).toString('hex');
  downloadTokens.set(token, {
    filename: item.content,
    originalName: item.originalName,
    expires: Date.now() + TOKEN_TTL_MS
  });
  return token;
};

// Periodic reaper: expire inactive clipboards and tokens, then delete any
// on-disk file no longer referenced by either.
setInterval(() => {
  const now = Date.now();

  for (const [token, dl] of downloadTokens) {
    if (now >= dl.expires) downloadTokens.delete(token);
  }

  for (const [code, item] of clipboards) {
    if (now - item.lastAccessed > EIGHT_HOURS_MS) {
      clipboards.delete(code);
      console.log(`[Cleanup] Expired ${code}`);
    }
  }

  const referenced = new Set();
  for (const [, item] of clipboards) if (item.content) referenced.add(item.content);
  for (const [, dl] of downloadTokens) referenced.add(dl.filename);

  fs.readdir(UPLOADS_DIR, (err, files) => {
    if (err) return;
    for (const f of files) {
      if (referenced.has(f)) continue;
      const full = path.join(UPLOADS_DIR, f);
      // Skip very recent files — a POST may have just written them before
      // the matching clipboards.set() ran.
      fs.stat(full, (err, stat) => {
        if (err || !stat) return;
        if (now - stat.mtimeMs < NEW_FILE_GRACE_MS) return;
        fs.unlink(full, (err) => {
          if (!err) console.log(`[Cleanup] Deleted orphan ${f}`);
        });
      });
    }
  });
}, REAP_INTERVAL_MS);

// POST: Create a new clipboard entry (text or arbitrary file)
app.post('/api/clipboard', upload.single('file'), (req, res) => {
  let type = req.body.type || 'text';
  let content = '';
  let originalName = '';
  let size = 0;

  if (req.file) {
    type = 'file';
    content = req.file.filename;
    originalName = req.file.originalname;
    size = req.file.size;
  } else if (type === 'text') {
    content = req.body.content;
    if (!content) return res.status(400).json({ error: 'Content is required' });
  } else {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  let code;
  let tries = 0;
  do {
    code = generateCode();
    if (++tries > 10) return res.status(503).json({ error: 'Code space exhausted' });
  } while (clipboards.has(code));

  clipboards.set(code, {
    type,
    content,
    originalName,
    size,
    visitsLeft: 3,
    lastAccessed: Date.now()
  });

  res.json({ code });
});

// GET: Retrieve clipboard metadata by code. Consumes one visit.
app.get('/api/clipboard/:code', (req, res) => {
  const code = req.params.code.toUpperCase();
  const item = clipboards.get(code);

  if (!item) return res.status(404).json({ error: 'Code not found or has expired.' });

  item.visitsLeft -= 1;
  const remaining = item.visitsLeft;
  const { type, content, originalName, size } = item;

  if (remaining <= 0) {
    clipboards.delete(code);
  } else {
    item.lastAccessed = Date.now();
  }

  if (type === 'file') {
    const token = issueDownloadToken(item);
    return res.json({
      type,
      originalName,
      size,
      visitsLeft: remaining,
      downloadUrl: `/api/download/${token}`
    });
  }
  res.json({ type, content, visitsLeft: remaining });
});

// GET: Serve a file by opaque one-session token. No access via raw code.
app.get('/api/download/:token', (req, res) => {
  const token = req.params.token;
  const dl = downloadTokens.get(token);
  if (!dl || Date.now() >= dl.expires) {
    return res.status(404).send('File not found or expired.');
  }
  const filePath = path.join(UPLOADS_DIR, dl.filename);
  // Strip characters that could break the Content-Disposition header.
  const safeName = (dl.originalName || dl.filename).replace(/[\r\n"\\/]/g, '_');
  res.download(filePath, safeName, (err) => {
    if (err && err.code !== 'ECONNABORTED') {
      console.error(`[Error] Failed to send file ${filePath}:`, err);
    }
  });
});

// GET: Generate a QR code for a given text/URL
app.get('/api/qrcode', async (req, res) => {
  const text = req.query.text;
  if (!text) return res.status(400).send('Text query param is required');
  try {
    const dataUrl = await qrcode.toDataURL(text, {
      color: { dark: '#FF003C', light: '#00000000' }
    });
    res.json({ dataUrl });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

// Translate multer size-limit errors into a useful JSON response.
app.use((err, req, res, next) => {
  if (err && err.name === 'MulterError') {
    return res.status(413).json({ error: err.message });
  }
  next(err);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
