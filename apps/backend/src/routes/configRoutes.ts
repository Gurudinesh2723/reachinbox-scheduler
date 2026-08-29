import { Router } from 'express';
import * as configController from '../controllers/configController';
import { requireAuth } from '../middleware/requireAuth';

const router = Router();

router.use(requireAuth);
router.get('/defaults', configController.getSchedulingDefaults);

export default router;
