import multer from 'multer';
import os from 'os';
import { ApiError } from '../utils/ApiError';

const ALLOWED_MIME_TYPES = new Set([
  'text/csv',
  'text/plain',
  'application/vnd.ms-excel',
  'application/csv',
]);

const ALLOWED_EXTENSIONS = /\.(csv|txt)$/i;

export const leadListUpload = multer({
  storage: multer.diskStorage({ destination: os.tmpdir() }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const mimeOk = ALLOWED_MIME_TYPES.has(file.mimetype);
    const extOk = ALLOWED_EXTENSIONS.test(file.originalname);
    if (!mimeOk && !extOk) {
      cb(ApiError.validation('Only .csv or .txt files are supported'));
      return;
    }
    cb(null, true);
  },
});
