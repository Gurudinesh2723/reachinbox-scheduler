import { Router } from 'express';
import * as slackController from '../controllers/slackController';
import { requireAuth } from '../middleware/requireAuth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.get('/status', requireAuth, asyncHandler(slackController.status));
router.get('/connect', requireAuth, slackController.connect);
router.get('/callback', asyncHandler(slackController.callback));
router.post('/disconnect', requireAuth, asyncHandler(slackController.disconnect));

export default router;
