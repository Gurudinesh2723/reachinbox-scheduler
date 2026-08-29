import { Router } from 'express';
import * as authController from '../controllers/authController';
import { requireAuth } from '../middleware/requireAuth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.get('/google', authController.startGoogleAuth);
router.get('/google/callback', asyncHandler(authController.googleCallback));
router.get('/me', requireAuth, authController.me);
router.post('/logout', authController.logout);

export default router;
