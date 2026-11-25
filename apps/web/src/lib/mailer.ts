import nodemailer from "nodemailer";
import { env } from "./env";
import { logger } from "./logger";

export type Mail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Display name for MAIL_FROM's address (e.g. the workspace name). */
  fromName?: string | null;
  replyTo?: string | null;
  headers?: Record<string, string>;
};

/** MAIL_FROM with another display name: `Acme <no-reply@x.com>`. */
export function fromWithName(name: string | null | undefined, mailFrom = env.MAIL_FROM) {
  if (!name) return mailFrom;
  const address = mailFrom.match(/<([^>]+)>/)?.[1] ?? mailFrom.trim();
  return `"${name.replace(/["\\\r\n]/g, "")}" <${address}>`;
}

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

class SmtpMailer implements Mailer {
  private transport = nodemailer.createTransport(env.SMTP_URL!);
  async send(mail: Mail) {
    const { fromName, replyTo, headers, ...rest } = mail;
    await this.transport.sendMail({
      ...rest,
      from: fromWithName(fromName),
      ...(replyTo ? { replyTo } : {}),
      // Sent as-is: nodemailer would otherwise MIME-encode values with quotes (JSON in
      // X-Mailgun-Variables), which providers don't decode.
      ...(headers
        ? {
            headers: Object.fromEntries(
              Object.entries(headers).map(([k, v]) => [k, { prepared: true, value: v }]),
            ),
          }
        : {}),
    });
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
