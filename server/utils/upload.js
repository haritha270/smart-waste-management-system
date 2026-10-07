'use strict';

/**
 * Multer configuration for waste report image uploads.
 * Accepts JPG / PNG / WEBP / GIF up to 3 MB and stores files in /uploads.
 */

const fs = require('fs');
const path = require('path');
const multer = require('multer');

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');
const MAX_SIZE = 3 * 1024 * 1024; // 3 MB
const ALLOWED = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];

const storage = multer.diskStorage({
  destination(req, file, cb) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    cb(null, UPLOAD_DIR);
  },
  filename(req, file, cb) {
    const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
    const safe = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    cb(null, `report-${safe}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE, files: 1 },
  fileFilter(req, file, cb) {
    if (!ALLOWED.includes(file.mimetype)) {
      return cb(new Error('Invalid image type. Please upload a JPG, PNG, WEBP or GIF image.'));
    }
    cb(null, true);
  },
});

/**
 * Wrap a multer single-file field so validation errors become 400 JSON
 * responses instead of crashing the request.
 */
function handleUpload(field) {
  return (req, res, next) => {
    upload.single(field)(req, res, (err) => {
      if (err) {
        const message =
          err.code === 'LIMIT_FILE_SIZE'
            ? 'Image is too large. Maximum allowed size is 3 MB.'
            : err.message || 'Image upload failed. Please try again.';
        return res.status(400).json({ ok: false, message });
      }
      next();
    });
  };
}

module.exports = { handleUpload, MAX_SIZE, ALLOWED, UPLOAD_DIR };
