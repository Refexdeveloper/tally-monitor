import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env';
import { logger } from '../config/logger';

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!env.SMTP_HOST) return null;
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
  });
  return transporter;
}

export function isMailConfigured() {
  return Boolean(env.SMTP_HOST);
}

export async function sendPasswordResetEmail(to: string, name: string, resetUrl: string) {
  const t = getTransporter();
  if (!t) {
    if (env.isProduction) {
      logger.warn('Password reset requested but SMTP is not configured; email not sent');
    } else {
      // Development convenience only: production never logs reset links.
      logger.info(`[dev] Password reset link for ${to}: ${resetUrl}`);
    }
    return;
  }
  await t.sendMail({
    from: env.SMTP_FROM,
    to,
    subject: 'Reset your Tally Monitor password',
    text: `Hi ${name},\n\nUse the link below to reset your Tally Monitor password. It expires in ${env.PASSWORD_RESET_TTL_MINUTES} minutes.\n\n${resetUrl}\n\nIf you did not request this, you can ignore this email.`,
    html: `<p>Hi ${escapeHtml(name)},</p><p>Use the link below to reset your Tally Monitor password. It expires in ${env.PASSWORD_RESET_TTL_MINUTES} minutes.</p><p><a href="${escapeHtml(resetUrl)}">Reset password</a></p><p>If you did not request this, you can ignore this email.</p>`,
  });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}
