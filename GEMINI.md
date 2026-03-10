# Clipboard Sharing App - Gemini Guidelines

## Project Overview

This is a web-based clipboard sharing application built with Node.js and Express, featuring a retro Cyberpunk/Terminal aesthetic. It allows users to paste text or images, generating a 4-character alphanumeric decryption key and a customized QR code. This key can be shared with others to retrieve the uploaded payload.

**Key Features & Constraints:**
- **Text & Image Support:** Users can paste both standard text and images (via `Ctrl+V` interception). Images are saved locally using `multer`.
- **In-Memory Store:** Metadata and text content are stored in memory (using a JavaScript `Map`). Image files are written to the filesystem.
- **Auto-Expiration:** Entries automatically expire and are deleted after **3 retrievals** or **8 hours of inactivity**. Both the map entry and the associated physical image file are purged.
- **Case-Insensitive Codes:** Retrieval codes are 4 characters (A-Z, 0-9) and are case-insensitive.
- **Cyberpunk UI:** The frontend utilizes pure CSS for a CRT terminal look (neon colors, scanlines, `VT323` pixel font).

## Architecture & Technologies

- **Backend:** Node.js with Express 5 (`server.js`).
- **Frontend:** Static HTML, Vanilla CSS, and Vanilla JavaScript served from the `public/` directory.
- **Dependencies:** 
  - `express`: Web framework.
  - `qrcode`: For generating stylized QR code data URLs.
  - `pm2`: Process manager for production deployment.
  - `multer`: Middleware for handling `multipart/form-data` file uploads.

### Key Files and Directories

- **`server.js`**: The main application entry point. Contains the Express server setup, multer configuration, in-memory `clipboards` Map, the hourly cleanup interval (including `fs.unlink` for images), and the API routes (`/api/clipboard`, `/api/clipboard/:code`, `/api/qrcode`).
- **`public/`**: Contains the client-side code:
  - `index.html`: The terminal-themed UI with UPLOAD and DOWNLOAD tabs.
  - `script.js`: Client-side logic for API interactions, paste event interception, `FormData` construction, and UI updates.
  - `style.css`: Application styling (CRT effects, neon colors).
  - `uploads/`: Directory for storing uploaded images.
- **`ecosystem.config.js`**: PM2 configuration for running the application in a production-like environment.

## Building and Running

### Development

To run the application locally for development:

1.  **Install dependencies:**
    ```bash
    npm install
    ```
2.  **Start the server:**
    ```bash
    node server.js
    ```
    The server will run on `http://localhost:3001` by default. You can override the port by setting the `PORT` environment variable. The server binds to `0.0.0.0` (all network interfaces).

### Production (PM2)

The `package.json` includes scripts for managing the application using PM2:

- **Start:** `npm start` (runs `pm2 start ecosystem.config.js`)
- **Stop:** `npm run stop`
- **Restart:** `npm run restart`
- **Logs:** `npm run logs`
- **Status:** `npm run status`

## Development Conventions

- **Module System:** The project uses CommonJS modules (`"type": "commonjs"` in `package.json`). Use `require()` and `module.exports`.
- **Testing/Linting:** There are currently no automated tests or linters configured for this project.
- **Simplicity:** Keep changes focused and simple. Avoid introducing complex build tools (like Webpack or Vite) or heavy frontend frameworks unless explicitly requested, as the project is designed to use vanilla JavaScript and CSS.
- **File Management:** When adding features that manipulate files, ensure strict cleanup logic is implemented to prevent memory or disk leaks.
