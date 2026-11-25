import { z } from "zod";
import type { UpsertSubscriberInput } from "./subscribers";

// The same check the server applies, so one address it rejects never fails a whole batch.
const isEmail = (email: string) => z.email().safeParse(email).success;

export const MAX_CSV_ROWS = 50_000;
/** Most subscribers per batch upsert (REST `POST /subscribers/batch`, CSV import chunks). */
export const MAX_SUBSCRIBER_BATCH = 500;

const EMAIL = ["email", "e-mail", "email address", "correo", "mail"];
const NAME = ["name", "full name", "nombre completo"];
const FIRST = ["firstname", "first name", "first_name", "nombre"];
const LAST = ["lastname", "last name", "last_name", "surname", "apellidos", "apellido"];
const LOCALE = ["locale", "language", "lang", "idioma"];
const EXTERNAL = ["externalid", "external id", "external_id", "ext_id", "user id", "user_id"];
const STATUS = ["status", "estado"];
const OPT_OUT_FLAGS = [
  "unsubscribed",
  "email_blacklisted",
  "blacklisted",
  "blocklisted",
  "email_blocklisted",
  "opt out",
  "opted out",
];
const OPT_OUT_STATUSES = new Set([
  "unsubscribed",
  "blacklisted",
  "blocklisted",
  "opted out",
  "opt-out",
  "baja",
  "dado de baja",
]);
const TRUE = new Set(["1", "true", "yes", "y", "si", "sí", "x"]);

export type CsvImportPreview = {
  items: UpsertSubscriberInput[];
  /** 1-based line numbers (header = line 1) with the reason they were skipped. */
  skipped: { line: number; reason: string }[];
  columns: { email: string; name?: string; locale?: string; externalId?: string; optOut?: string };
};

/** Splits CSV text into rows. Handles quotes, escaped quotes, CRLF and `,` `;` or tab separators. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const sep = [";", "\t", ","].reduce((best, c) =>
    firstLine.split(c).length > firstLine.split(best).length ? c : best,
  );
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === sep) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

// Brevo prefixes its subscription columns with "_" (`_BLOCKLISTED`, `_SUBSCRIBED`).
const norm = (h: string) => h.trim().toLowerCase().replace(/\s+/g, " ").replace(/^_+/, "");

/**
 * An opt-out flag cell: a yes-like value, or Brevo's channel list (`['email_marketing']`) when it
 * names an email channel (a contact blocklisted only for SMS still gets emails).
 */
const flagged = (value: string) => {
  const v = norm(value);
  return TRUE.has(v) || (/^\[.*\]$/.test(v) && v.includes("email"));
};

/**
 * Turns a CSV export (e.g. from Brevo/Sendinblue, Mailchimp or a spreadsheet) into subscriber
 * upserts. Column names are matched loosely; `email` is the only required column. Rows marked as
 * unsubscribed or blocklisted become opt-outs, and `markAllUnsubscribed` treats every row as one.
 */
export function subscribersFromCsv(
  text: string,
  opts: { markAllUnsubscribed?: boolean } = {},
): CsvImportPreview {
  const rows = parseCsv(text);
  const header = (rows[0] ?? []).map(norm);
  const find = (names: string[]) => {
    const i = header.findIndex((h) => names.includes(h));
    return i >= 0 ? i : undefined;
  };
  const emailCol = find(EMAIL);
  if (emailCol === undefined) throw new Error("The file needs an email column");
  const nameCol = find(NAME);
  const firstCol = find(FIRST);
  const lastCol = find(LAST);
  const localeCol = find(LOCALE);
  const externalCol = find(EXTERNAL);
  const statusCol = find(STATUS);
  const flagCol = find(OPT_OUT_FLAGS);
  if (rows.length - 1 > MAX_CSV_ROWS)
    throw new Error(`At most ${MAX_CSV_ROWS.toLocaleString("en")} rows per file`);

  const items: UpsertSubscriberInput[] = [];
  const skipped: CsvImportPreview["skipped"] = [];
  const seen = new Set<string>();
  const cell = (r: string[], i: number | undefined) => (i === undefined ? "" : (r[i] ?? "").trim());

  rows.slice(1).forEach((r, idx) => {
    const line = idx + 2;
    const email = cell(r, emailCol).toLowerCase();
    if (!isEmail(email)) {
      skipped.push({ line, reason: email ? `Invalid email: ${email}` : "No email" });
      return;
    }
    if (seen.has(email)) {
      skipped.push({ line, reason: `Duplicate email: ${email}` });
      return;
    }
    seen.add(email);
    const name =
      cell(r, nameCol) || [cell(r, firstCol), cell(r, lastCol)].filter(Boolean).join(" ");
    const status = norm(cell(r, statusCol));
    const optedOut =
      opts.markAllUnsubscribed === true ||
      OPT_OUT_STATUSES.has(status) ||
      flagged(cell(r, flagCol));
    const item: UpsertSubscriberInput = { email };
    if (name) item.name = name;
    const locale = cell(r, localeCol);
    if (locale) item.locale = locale;
    const externalId = cell(r, externalCol);
    if (externalId) item.externalId = externalId;
    if (optedOut) item.unsubscribed = true;
    items.push(item);
  });

  const col = (i: number | undefined) => (i === undefined ? undefined : rows[0]![i]!.trim());
  return {
    items,
    skipped,
    columns: {
      email: col(emailCol)!,
      name:
        col(nameCol) ?? ([col(firstCol), col(lastCol)].filter(Boolean).join(" + ") || undefined),
      locale: col(localeCol),
      externalId: col(externalCol),
      optOut: col(statusCol) ?? col(flagCol),
    },
  };
}
