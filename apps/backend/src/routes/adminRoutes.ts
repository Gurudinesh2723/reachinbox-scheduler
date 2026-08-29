import { Router } from 'express';
import basicAuth from 'express-basic-auth';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { emailQueue } from '../queues/emailQueue';
import { env } from '../config/env';

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [new BullMQAdapter(emailQueue)],
  serverAdapter,
});

const router = Router();

router.use(
  basicAuth({
    users: { [env.BULLBOARD_USER]: env.BULLBOARD_PASSWORD },
    challenge: true,
  }),
);
router.use(serverAdapter.getRouter());

export default router;
