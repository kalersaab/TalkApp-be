import multer from 'multer';
import { HttpException } from '@exceptions/HttpException';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(new HttpException(400, 'Only jpg, png, and webp images are allowed') as unknown as null, false);
    }
    cb(null, true);
  },
}).single('avatar');
