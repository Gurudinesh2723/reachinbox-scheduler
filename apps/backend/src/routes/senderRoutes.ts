import { Router } from 'express';
import * as senderController from '../controllers/senderController';
import { requireAuth } from '../middleware/requireAuth';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { createSenderSchema } from '../validation/senderSchemas';

const router = Router();

router.use(requireAuth);
router.get('/', asyncHandler(senderController.list));
router.post('/', validate(createSenderSchema), asyncHandler(senderController.create));

export default router;
