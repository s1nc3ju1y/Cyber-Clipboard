# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A cyber-themed web-based clipboard sharing app. Users can paste text or images directly (Ctrl+V) into the terminal interface to get a 4-character alphanumeric code (and QR code). They can then share that code so others can retrieve the content. Entries auto-expire after 3 retrievals or 8 hours of inactivity.

## Commands

- **Install dependencies:** `npm install`
- **Run server:** `node server.js` (defaults to port 3000, configurable via `PORT` env var)
- **Start via PM2:** `npm start`
- **No test suite or linter is configured.**

## Architecture

- **server.js** — Express 5 backend with three API endpoints:
  - `POST /api/clipboard` — stores content (text or multipart image via `multer`), returns a 4-char code. Images are stored in `public/uploads/`.
  - `GET /api/clipboard/:code` — retrieves content/image path, decrements visit counter (max 3 visits). Auto-deletes associated image files when limits are reached.
  - `GET /api/qrcode?text=` — returns a styled QR code data URL via the `qrcode` library.
  - Core data mapping is in-memory (`Map`). Hourly cleanup removes entries inactive for 8+ hours and unlinks orphaned files.
- **public/** — Static frontend served by Express:
  - `index.html` — Cyberpunk-themed UI (UPLOAD / DOWNLOAD).
  - `script.js` — Client-side logic for text/image paste interception, file uploading (`FormData`), retrieving clips, QR display, and deep-link support via `?c=CODE` query param.
  - `style.css` — Cyberpunk styling with CRT scanline effects and neon variables.
  - `uploads/` — Local storage for pasted images.

## Key Details

- CommonJS modules (`"type": "commonjs"` in package.json)
- Server binds to `0.0.0.0` (all interfaces)
- Codes are case-insensitive (uppercased on retrieval)
- The application uses `multer` for handling `multipart/form-data`.
