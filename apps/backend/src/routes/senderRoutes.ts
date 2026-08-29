import { Router } from 'express';
import * as senderController from '../controllers/senderController';
import { requireAuth } from '../middleware/requireAuth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.use(requireAuth);
router.get('/', asyncHandler(senderController.list));

export default router;
