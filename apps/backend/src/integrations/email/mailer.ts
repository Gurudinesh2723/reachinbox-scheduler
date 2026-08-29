import nodemailer, { Transporter } from 'nodemailer';
import { env } from '../../config/env';
import { logger } from '../../config/logger';

let transporterPromise: Promise<Transporter> | null = null;

/**
 * Lazily builds a single reusable Nodemailer transporter against Ethereal
 * Email. If explicit ETHEREAL_USER/ETHEREAL_PASSWORD credentials are not
 * provided, a real Ethereal test account is created on demand via
 * nodemailer.createTestAccount() (a genuine call to the Ethereal API) so the
 * integration is real end-to-end without requiring pre-provisioned secrets.
 */
async function getTransporter(): Promise<Transporter> {
  if (!transporterPromise) {
    transporterPromise = (async () => {
      let host = env.ETHEREAL_HOST;
      let port = env.ETHEREAL_PORT;
      let user = env.ETHEREAL_USER;
      let pass = env.ETHEREAL_PASSWORD;

      if (!user || !pass) {
        logger.info('No ETHEREAL_USER/ETHEREAL_PASSWORD configured - creating a fresh Ethereal test account');
        const testAccount = await nodemailer.createTestAccount();
        host = testAccount.smtp.host;
        port = testAccount.smtp.port;
        user = testAccount.user;
        pass = testAccount.pass;
        logger.info({ user, previewHost: 'https://ethereal.email' }, 'Ethereal test account created');
      }

      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });

      await transporter.verify();
      logger.info({ host, port }, 'Ethereal SMTP transporter verified and ready');
      return transporter;
    })();
  }
  return transporterPromise;
}

export interface SendEmailResult {
  providerMessageId: string;
  previewUrl: string | false;
}

export async function sendEmail(params: {
  from: string;
  to: string;
  subject: string;
  html: string;
}): Promise<SendEmailResult> {
  const transporter = await getTransporter();
  const info = await transporter.sendMail({
    from: params.from,
    to: params.to,
    subject: params.subject,
    html: params.html,
  });

  return {
    providerMessageId: info.messageId,
    previewUrl: nodemailer.getTestMessageUrl(info),
  };
}
