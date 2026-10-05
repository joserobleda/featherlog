import nodemailer from "nodemailer";
import { env } from "./env";
import { logger } from "./logger";

export type Mail = { to: string; subject: string; html: string; text: string };

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

class SmtpMailer implements Mailer {
  private transport = nodemailer.createTransport(env.SMTP_URL!);
  async send(mail: Mail) {
    await this.transport.sendMail({ from: env.MAIL_FROM, ...mail });
    logger.info({ to: mail.to, subject: mail.subject }, "email sent");
  }
}

/** Used when SMTP_URL isn't set: emails are skipped (and logged) instead of failing. */
class NoopMailer implements Mailer {
  async send(mail: Mail) {
    logger.info({ to: mail.to, subject: mail.subject }, "email skipped (SMTP_URL not configured)");
  }
}

export const mailer: Mailer = env.emailEnabled ? new SmtpMailer() : new NoopMailer();

/** Sends without throwing (auth flows should not fail because SMTP is down); errors are logged. */
export async function sendMailSafe(mail: Mail) {
  try {
    await mailer.send(mail);
  } catch (err) {
    logger.error({ err, to: mail.to, subject: mail.subject }, "failed to send email");
  }
}
