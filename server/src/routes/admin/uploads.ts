import { Router } from 'express';
import multer from 'multer';
import { asyncHandler, HttpError } from '../../middleware/error.js';
import { audit } from '../../lib/audit.js';
import { imageStore, sniffImage } from '../../lib/storage.js';

const router = Router();

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 0 },
});

// Single image upload. The type is decided from the file's bytes, never its name or header,
// and SVG is refused (it can carry script).
router.post(
  '/images',
  (req, res, next) => {
    upload.single('file')(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError) {
        return next(new HttpError(400, err.code === 'LIMIT_FILE_SIZE' ? 'Images must be 5 MB or smaller' : err.message));
      }
      next(err);
    });
  },
  asyncHandler(async (req, res) => {
    if (!req.file) throw new HttpError(400, 'Choose an image to upload');
    const ext = sniffImage(req.file.buffer);
    if (!ext) throw new HttpError(400, 'Only JPEG, PNG, WebP or GIF images are allowed');
    const url = await imageStore.save(req.file.buffer, ext);
    await audit(req, 'upload.image', { meta: { url, bytes: req.file.size } });
    res.status(201).json({ url });
  })
);

export default router;
