# Newsletters

Featherlog can email your users the product updates published since the last email. It keeps the list of subscribers, writes a draft (with Claude, when configured), lets a person review and edit it, and sends it.

## How it works

1. **Subscribers.** Your app keeps the list in sync through the REST API (`PUT /subscribers/{externalId}`), or you import a CSV in **Settings → Subscribers**. Each subscriber has a language. See [Keep email subscribers in sync](api.md#keep-email-subscribers-in-sync).
2. **New email.** In **Newsletters → New email**, Featherlog takes every published post that has not gone out in a newsletter yet. A post goes out in at most one newsletter.
3. **Draft.** A background job writes one version per workspace language:
   - With `ANTHROPIC_API_KEY`, Claude picks the most important posts as featured sections, summarizes the rest in a list, and writes a subject, preview text and intro. It translates posts that have no version in a language. It never writes links: Featherlog adds them.
   - Without it, or if Claude fails, the draft lists the three newest posts in full (title and excerpt) and the rest as a list.
4. **Review.** Edit the subject, preview text and Markdown body per language, preview the email, take posts out (they go in the next email) or rewrite the draft. **Send test to me** sends one version to your own address.
5. **Send.** Only a person in the dashboard can send. The recipient list is frozen when you click **Send**, and each person gets their language, or the workspace default. Sending is throttled (`NEWSLETTER_RATE_PER_MINUTE`) and resumes after a restart without emailing anyone twice.

Integrations can prepare drafts through the REST API (`POST /newsletters`) and MCP (`create_newsletter_draft`), but never send them.

## Requirements

| What | Why |
| --- | --- |
| `SMTP_URL` | To send at all. Use a provider meant for bulk email (Amazon SES, Postmark broadcast streams, Brevo or Mailgun SMTP…) and set up SPF, DKIM and DMARC for the `MAIL_FROM` domain. |
| A worker (`WORKER_MODE=inline` or `separate`) | Drafts and sending run as jobs. With `WORKER_MODE=off` they run inside the request's process, which is fine for small lists. |
| `ANTHROPIC_API_KEY` (optional) | AI-written drafts. `NEWSLETTER_MODEL` picks the model (default `claude-opus-5-5`). |

## Email settings

**Newsletters → Email settings**:

- **Sender name**: the display name in front of `MAIL_FROM`'s address. Defaults to the workspace name.
- **Reply-to address**: where replies go.
- **Footer**: company name and postal address. Anti-spam laws (CAN-SPAM, and similar rules in the EU) require a postal address in marketing email.
- **Guidance for the AI writer**: tone, audience, what to highlight or avoid.
- **Include posts since**: posts published before this date never go in an email. Set it to the date of the last email you sent with another tool, so the first one from Featherlog doesn't repeat old posts.
- **Skip people who already read it**: see [Identified readers](#identified-readers).

## Unsubscribing

Every email has an unsubscribe link and `List-Unsubscribe` / `List-Unsubscribe-Post` headers (RFC 8058), so Gmail and Apple Mail show their own unsubscribe button. The link opens a confirmation page in the subscriber's language, so link scanners don't unsubscribe anyone. The headers' one-click endpoint unsubscribes right away.

Unsubscribes are sticky: your app's sync never subscribes the person again. Only an admin can, in **Settings → Subscribers**.

SMTP providers accept a message and bounce it later, so Featherlog only sees those failures through the provider's webhooks. With Mailgun, see below. With other providers, a later bounce isn't recorded, and you can mark the subscriber as unsubscribed in **Settings → Subscribers**.

## Sending with Mailgun

1. In Mailgun, add a sending domain only for newsletters (for example `news.example.com`) and publish its SPF, DKIM and DMARC records. A separate domain keeps spam complaints about the newsletter away from your app's transactional email.
2. In that domain's **Tracking** settings, turn off click tracking and Mailgun's unsubscribe link: Featherlog adds its own.
3. Create SMTP credentials for the domain and set:

   ```sh
   SMTP_URL=smtps://postmaster%40news.example.com:SMTP_PASSWORD@smtp.eu.mailgun.org:465
   MAIL_FROM="Example <updates@news.example.com>"
   ```

   Use `smtp.mailgun.org` for accounts in the US region. Encode the `@` of the user as `%40`.
4. Copy the **HTTP webhook signing key** (Sending → Webhooks) to `MAILGUN_WEBHOOK_SIGNING_KEY`, and add a webhook to `https://<APP_URL>/api/webhooks/mailgun` for **Permanent failure**, **Spam complaints** and **Unsubscribes**.

Each newsletter email carries `X-Mailgun-Variables` with the workspace, subscriber and newsletter ids, which Mailgun sends back in its webhooks. Then:

- **Permanent failure** (including addresses Mailgun already suppresses): the subscriber becomes **bounced** and the delivery counts as failed on the newsletter. If your app's sync later sends a different email address for that person, they are subscribed again.
- **Spam complaint** or **unsubscribe**: the subscriber is unsubscribed for good.
- Temporary failures, other events, and emails that aren't newsletters are ignored. Requests with an invalid or older-than-15-minutes signature get `406`.

## Identified readers

When the widget knows who is signed in to your app, Featherlog records which subscriber saw which post:

- In the widget: when they open it (signed, see [Identify signed-in users](widget.md#identify-signed-in-users)).
- From the email: every link to a post is a per-recipient tracked link that redirects to the post.

You get:

- **Reads per post** on each newsletter (in the app and from the email), and how many people opened a post from the email.
- **The same "seen" state on every device**: the badge doesn't count a post as new if the person already saw it elsewhere or opened it from an email.
- **Skip people who already read it** (Email settings): subscribers who already saw every post of a newsletter in the widget don't get the email. The send dialog shows how many are skipped.

Email opens (tracking pixels) are not recorded.
