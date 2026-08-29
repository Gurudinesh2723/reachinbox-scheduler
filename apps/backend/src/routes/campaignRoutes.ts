import { Router } from 'express';
import * as campaignController from '../controllers/campaignController';
import { requireAuth } from '../middleware/requireAuth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.use(requireAuth);
router.get('/', asyncHandler(campaignController.list));
router.get('/:id', asyncHandler(campaignController.getById));

export default router;
