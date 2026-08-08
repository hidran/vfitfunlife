/**
 * Transactional email via Resend.
 *
 * Uses Resend's REST API directly rather than the `resend` SDK: Node 24 ships global
 * fetch, so this adds no dependency and cannot break the build before the package is
 * installed. Swap in the SDK later if retries/batching are needed.
 *
 * **Every failure path returns false rather than throwing.** Email must never roll back
 * or block a booking status transition — spec §9.2.
 */

import { logger } from "firebase-functions";
import { defineSecret } from "firebase-functions/params";

export const RESEND_API_KEY = defineSecret("RESEND_API_KEY");

/** Secrets to attach to any callable that sends email. */
export const EMAIL_SECRETS = [RESEND_API_KEY];

const FROM_ADDRESS = process.env.EMAIL_FROM || "V Fitness <noreply@vfitness.it>";
const RESEND_ENDPOINT = "https://api.resend.com/emails";

export interface SendEmailArgs {
  to: string;
  subject: string;
  /** Plain-text body; wrapped in the shared HTML layout. */
  body: string;
  /** Optional call-to-action rendered as a button. */
  action?: { label: string; url: string };
}

/** Minimal, inline-styled layout — email clients are hostile to stylesheets. */
function renderHtml(args: SendEmailArgs): string {
  const button = args.action
    ? `<p style="margin:24px 0;">
         <a href="${escapeHtml(args.action.url)}"
            style="background:#111;color:#fff;text-decoration:none;padding:12px 20px;
                   border-radius:8px;display:inline-block;font-weight:600;">
           ${escapeHtml(args.action.label)}
         </a>
       </p>`
    : "";

  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f6f6f6;
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;">
    <h1 style="font-size:20px;margin:0 0 16px;">${escapeHtml(args.subject)}</h1>
    <p style="font-size:16px;line-height:1.5;margin:0;">${escapeHtml(args.body)}</p>
    ${button}
    <hr style="border:none;border-top:1px solid #eee;margin:32px 0 16px;">
    <p style="font-size:12px;color:#777;margin:0;">V Fitness &amp; Wellness</p>
  </div>
</body></html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @returns true if the provider accepted the message; false if it was skipped or failed.
 *          Never throws.
 */
export async function sendEmail(args: SendEmailArgs): Promise<boolean> {
  let apiKey: string | undefined;
  try {
    apiKey = RESEND_API_KEY.value();
  } catch {
    apiKey = process.env.RESEND_API_KEY;
  }

  if (!apiKey) {
    // Expected before the Resend account is provisioned. The rest of the flow works.
    logger.info("[email] RESEND_API_KEY not configured — skipping", { to: args.to });
    return false;
  }

  if (!args.to || !args.to.includes("@")) {
    logger.info("[email] no usable recipient address — skipping");
    return false;
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [args.to],
        subject: args.subject,
        html: renderHtml(args),
        text: args.body,
      }),
    });

    if (!res.ok) {
      logger.warn("[email] provider rejected the message", {
        status: res.status,
        body: await res.text().catch(() => "<unreadable>"),
      });
      return false;
    }
    return true;
  } catch (err) {
    // Swallowed deliberately: a transition must not fail because email did.
    logger.warn("[email] send failed", { error: err instanceof Error ? err.message : String(err) });
    return false;
  }
}
