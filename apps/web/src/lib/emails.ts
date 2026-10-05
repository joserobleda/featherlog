import type { Mail } from "./mailer";

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

function layout(title: string, body: string, cta?: { label: string; url: string }) {
  const button = cta
    ? `<p style="margin:28px 0"><a href="${esc(cta.url)}" style="background:#3778ff;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;display:inline-block">${esc(cta.label)}</a></p>
       <p style="color:#6b7280;font-size:13px">Or paste this link in your browser:<br><a href="${esc(cta.url)}" style="color:#3778ff;word-break:break-all">${esc(cta.url)}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827">
  <div style="max-width:520px;margin:0 auto;padding:40px 24px">
    <div style="font-weight:700;font-size:18px;margin-bottom:24px">🪶 Featherlog</div>
    <div style="background:#fff;border-radius:12px;padding:32px;border:1px solid #e5e7eb">
      <h1 style="font-size:20px;margin:0 0 16px">${esc(title)}</h1>
      ${body}${button}
    </div>
    <p style="color:#9ca3af;font-size:12px;margin-top:24px">You received this email because of an action on Featherlog. If it wasn't you, you can ignore it.</p>
  </div></body></html>`;
}

export function verifyEmail(to: string, url: string): Mail {
  return {
    to,
    subject: "Verify your email",
    html: layout(
      "Verify your email",
      "<p>Confirm your email address to finish setting up your account.</p>",
      {
        label: "Verify email",
        url,
      },
    ),
    text: `Verify your email: ${url}`,
  };
}

export function magicLinkEmail(to: string, url: string): Mail {
  return {
    to,
    subject: "Your sign-in link",
    html: layout(
      "Sign in to Featherlog",
      "<p>Click the button below to sign in. The link expires in 10 minutes.</p>",
      {
        label: "Sign in",
        url,
      },
    ),
    text: `Sign in to Featherlog: ${url}`,
  };
}

export function resetPasswordEmail(to: string, url: string): Mail {
  return {
    to,
    subject: "Reset your password",
    html: layout(
      "Reset your password",
      "<p>Someone asked to reset the password for this account.</p>",
      {
        label: "Choose a new password",
        url,
      },
    ),
    text: `Reset your password: ${url}`,
  };
}

export function invitationEmail(
  to: string,
  opts: { workspace: string; inviter: string; url: string },
): Mail {
  return {
    to,
    subject: `${opts.inviter} invited you to ${opts.workspace} on Featherlog`,
    html: layout(
      `Join ${opts.workspace}`,
      `<p><strong>${esc(opts.inviter)}</strong> invited you to collaborate on the <strong>${esc(opts.workspace)}</strong> changelog.</p>`,
      { label: "Accept invitation", url: opts.url },
    ),
    text: `${opts.inviter} invited you to ${opts.workspace} on Featherlog: ${opts.url}`,
  };
}
