import { describe, expect, it } from "vitest";
import { parseCsv, subscribersFromCsv } from "../src/subscriber-csv";

describe("subscriber CSV import", () => {
  it("parses quotes, escaped quotes, CRLF and detects the separator", () => {
    expect(parseCsv('a;b\r\n"x;1";"say ""hi"""\r\n\r\n')).toEqual([
      ["a", "b"],
      ["x;1", 'say "hi"'],
    ]);
    expect(parseCsv("﻿email,name\nA@x.com,Ana")).toEqual([
      ["email", "name"],
      ["A@x.com", "Ana"],
    ]);
  });

  it("reads a Brevo export: first + last name, language and blocklisted contacts", () => {
    const csv = [
      "CONTACT ID;EMAIL;FIRSTNAME;LASTNAME;LANGUAGE;EMAIL_BLACKLISTED",
      "1;Ana@Acme.com;Ana;García;es;false",
      "2;bob@globex.com;Bob;;en;true",
      "3;not-an-email;;;;",
      "4;ana@acme.com;Dup;;;",
    ].join("\n");
    const r = subscribersFromCsv(csv);
    expect(r.items).toEqual([
      { email: "ana@acme.com", name: "Ana García", locale: "es" },
      { email: "bob@globex.com", name: "Bob", locale: "en", unsubscribed: true },
    ]);
    expect(r.skipped).toEqual([
      { line: 4, reason: "Invalid email: not-an-email" },
      { line: 5, reason: "Duplicate email: ana@acme.com" },
    ]);
    expect(r.columns).toMatchObject({ email: "EMAIL", locale: "LANGUAGE" });
  });

  it("reads the current Brevo export: _BLOCKLISTED with channel lists and EXT_ID", () => {
    const csv = [
      "EMAIL;NOMBRE;SURNAME;EXT_ID;ADDED_TIME;MODIFIED_TIME;_SUBSCRIBED;_BLOCKLISTED",
      "ana@acme.com;Ana;García;42;2024-01-01;2024-01-02;['email_marketing'];",
      "bob@globex.com;Bob;;;2024-01-01;2024-01-02;;['email_marketing']",
      "sms@globex.com;Sam;;;2024-01-01;2024-01-02;['email_marketing'];['sms']",
    ].join("\n");
    const r = subscribersFromCsv(csv);
    expect(r.items).toEqual([
      { email: "ana@acme.com", name: "Ana García", externalId: "42" },
      { email: "bob@globex.com", name: "Bob", unsubscribed: true },
      { email: "sms@globex.com", name: "Sam" },
    ]);
    expect(r.columns).toMatchObject({ optOut: "_BLOCKLISTED", externalId: "EXT_ID" });
  });

  it("skips addresses the server would reject, so they never fail a whole batch", () => {
    const csv = ["email", "ok@acme.com", "josé@acme.com", "ana..b@acme.com"].join("\n");
    const r = subscribersFromCsv(csv);
    expect(r.items).toEqual([{ email: "ok@acme.com" }]);
    expect(r.skipped.map((s) => s.line)).toEqual([3, 4]);
  });

  it("understands status columns, external ids and the mark-all option", () => {
    const csv = "email,name,status,external_id\nc@x.com,Cat,unsubscribed,42\nd@x.com,Dan,active,";
    expect(subscribersFromCsv(csv).items).toEqual([
      { email: "c@x.com", name: "Cat", externalId: "42", unsubscribed: true },
      { email: "d@x.com", name: "Dan" },
    ]);
    expect(
      subscribersFromCsv(csv, { markAllUnsubscribed: true }).items.every((i) => i.unsubscribed),
    ).toBe(true);
  });

  it("requires an email column", () => {
    expect(() => subscribersFromCsv("name\nAna")).toThrow(/email column/);
  });
});
