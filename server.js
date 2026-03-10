const express = require('express');
const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Set up multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, 'public', 'uploads'));
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname) || '.png';
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + ext);
  }
});
const upload = multer({ storage: storage });

// In-memory store: Map<Code, { type, content, visitsLeft, lastAccessed }>
const clipboards = new Map();

// Helper to generate a random 4-character code (A-Z, 0-9)
const generateCode = () => {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let result = '';
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// Helper to delete file if it's an image
const deleteImageFile = (item) => {
  if (item.type === 'image' && item.content) {
    const filePath = path.join(__dirname, 'public', item.content);
    fs.unlink(filePath, (err) => {
      if (err && err.code !== 'ENOENT') console.error(`[Error] Failed to delete file ${filePath}:`, err);
    });
  }
};

// Cleanup routine: Remove records not accessed in the last 8 hours
setInterval(() => {
  const now = Date.now();
  const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;
  for (const [code, item] of clipboards.entries()) {
    if (now - item.lastAccessed > EIGHT_HOURS_MS) {
      deleteImageFile(item);
      clipboards.delete(code);
      console.log(`[Cleanup] Deleted inactive code: ${code}`);
    }
  }
}, 60 * 60 * 1000);

// POST: Create a new clipboard entry (handles both text and image)
app.post('/api/clipboard', upload.single('image'), (req, res) => {
  const type = req.body.type || 'text';
  let content = '';

  if (type === 'text') {
    content = req.body.content;
    if (!content) return res.status(400).json({ error: 'Content is required' });
  } else if (type === 'image') {
    if (!req.file) return res.status(400).json({ error: 'Image file is required' });
    content = '/uploads/' + req.file.filename;
  } else {
    return res.status(400).json({ error: 'Invalid type' });
  }

  let code;
  do {
    code = generateCode();
  } while (clipboards.has(code)); // ensure unique code

  clipboards.set(code, {
    type,
    content,
    visitsLeft: 3, // 3 visits limit
    lastAccessed: Date.now()
  });

  res.json({ code });
});

// GET: Retrieve clipboard content by code
app.get('/api/clipboard/:code', (req, res) => {
  const code = req.params.code.toUpperCase();
  const item = clipboards.get(code);

  if (!item) {
    return res.status(404).json({ error: 'Code not found or has expired.' });
  }

  item.lastAccessed = Date.now();
  
  const type = item.type || 'text';
  const content = item.content;
  item.visitsLeft -= 1;
  const remaining = item.visitsLeft;

  if (item.visitsLeft <= 0) {
    clipboards.delete(code);
    
    // Delay deletion by 5 minutes to ensure the client has time to fetch the image via URL
    if (type === 'image') {
       setTimeout(() => {
           deleteImageFile({ type, content });
       }, 5 * 60 * 1000);
    }
  }

  res.json({ type, content, visitsLeft: remaining });
});

// GET: Generate QR Code for a given text/URL
app.get('/api/qrcode', async (req, res) => {
  const text = req.query.text;
  if (!text) return res.status(400).send('Text query param is required');
  try {
    const dataUrl = await qrcode.toDataURL(text, {
      color: {
        dark: '#FF003C', // Cyberpunk pink
        light: '#00000000' // Transparent
      }
    });
    res.json({ dataUrl });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
