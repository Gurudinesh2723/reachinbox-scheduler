import { Router } from 'express';
import * as emailController from '../controllers/emailController';
import { requireAuth } from '../middleware/requireAuth';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { leadListUpload } from '../middleware/upload';
import { emailIdParamSchema, scheduleEmailsSchema, searchEmailsQuerySchema } from '../validation/emailSchemas';

const router = Router();

router.use(requireAuth);

router.post('/parse-recipients', leadListUpload.single('file'), asyncHandler(emailController.parseRecipients));
router.post('/schedule', validate(scheduleEmailsSchema), asyncHandler(emailController.schedule));
router.get('/scheduled', asyncHandler(emailController.listScheduled));
router.get('/sent', asyncHandler(emailController.listSent));
router.get('/search', validate(searchEmailsQuerySchema, 'query'), asyncHandler(emailController.search));
router.get('/:id', validate(emailIdParamSchema, 'params'), asyncHandler(emailController.getById));

export default router;
