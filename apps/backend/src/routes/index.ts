import { Router } from 'express';
import authRoutes from './authRoutes';
import emailRoutes from './emailRoutes';
import campaignRoutes from './campaignRoutes';
import senderRoutes from './senderRoutes';
import slackRoutes from './slackRoutes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/emails', emailRoutes);
router.use('/campaigns', campaignRoutes);
router.use('/senders', senderRoutes);
router.use('/slack', slackRoutes);

export default router;
