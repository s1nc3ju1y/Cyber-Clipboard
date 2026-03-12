const express = require('express');
const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Set up multer for file uploads with size limits (e.g., 50MB)
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, 'public', 'uploads'));
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname) || '';
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + ext);
  }
});
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50 MB limit
});

// In-memory store: Map<Code, { type, content, originalName, size, visitsLeft, lastAccessed }>
const clipboards = new Map();
const downloads = new Map();

// Helper to generate a random 4-character code (A-Z, 0-9)
const generateCode = () => {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let result = '';
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// Helper to delete physical file
const deletePhysicalFile = (item) => {
  if ((item.type === 'image' || item.type === 'file') && item.content) {
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
      deletePhysicalFile(item);
      clipboards.delete(code);
      console.log(`[Cleanup] Deleted inactive code: ${code}`);
    }
  }
}, 60 * 60 * 1000);

// POST: Create a new clipboard entry (handles text, image, and arbitrary files)
app.post('/api/clipboard', upload.single('file'), (req, res) => {
  let type = req.body.type || 'text';
  let content = '';
  let originalName = '';
  let size = 0;

  if (req.file) {
    // If a file is uploaded, override type if it was just 'text' but file was sent
    type = type === 'text' ? 'file' : type;
    content = '/uploads/' + req.file.filename;
    originalName = req.file.originalname;
    size = req.file.size;
  } else if (type === 'text') {
    content = req.body.content;
    if (!content) return res.status(400).json({ error: 'Content is required' });
  } else {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  let code;
  do {
    code = generateCode();
  } while (clipboards.has(code)); // ensure unique code

  clipboards.set(code, {
    type,
    content,
    originalName,
    size,
    visitsLeft: 3, // 3 visits limit
    lastAccessed: Date.now()
  });

  res.json({ code });
});

// GET: Retrieve clipboard metadata by code
app.get('/api/clipboard/:code', (req, res) => {
  const code = req.params.code.toUpperCase();
  const item = clipboards.get(code);

  if (!item) {
    return res.status(404).json({ error: 'Code not found or has expired.' });
  }

  item.lastAccessed = Date.now();
  
  const type = item.type || 'text';
  const content = item.content;
  const originalName = item.originalName;
  const size = item.size;
  
  item.visitsLeft -= 1;
  const remaining = item.visitsLeft;

  if (item.visitsLeft <= 0) {
    clipboards.delete(code);
    
    // Delay deletion by 5 minutes to ensure the client has time to fetch/download the file
    if (type === 'image' || type === 'file') {
       downloads.set(code, { content, originalName });
       setTimeout(() => {
           downloads.delete(code);
           deletePhysicalFile({ type, content });
       }, 5 * 60 * 1000);
    }
  }

  // If it's a generic file, we don't send the direct static path to prevent XSS execution
  if (type === 'file') {
     res.json({ type, originalName, size, visitsLeft: remaining, downloadUrl: `/api/download/${code}` });
  } else {
     res.json({ type, content, visitsLeft: remaining });
  }
});

// GET: Secure download endpoint for files
app.get('/api/download/:code', (req, res) => {
    const code = req.params.code.toUpperCase();
    const item = clipboards.get(code) || downloads.get(code);
    
    if (!item || !item.content) {
        return res.status(404).send('File not found or expired.');
    }
    
    const filePath = path.join(__dirname, 'public', item.content);
    const fileName = item.originalName || path.basename(item.content);
    
    res.download(filePath, fileName, (err) => {
        if (err && err.code !== 'ECONNABORTED') {
            console.error(`[Error] Failed to send file ${filePath}:`, err);
        }
    });
});
