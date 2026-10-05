"use server";
import { updateProfile } from "@featherlog/core";
import { cookies } from "next/headers";
import { runAction } from "@/lib/actions";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";

export async function updateProfileAction(input: {
  name: string;
  displayName: string;
  jobTitle: string;
}) {
  const session = await requireSession("/app/account");
  return runAction(async () => {
    const u = await updateProfile(db, session.user.id, {
      name: input.name,
      displayName: input.displayName.trim() || null,
      jobTitle: input.jobTitle.trim() || null,
    });
    return { name: u.name, displayName: u.displayName ?? "", jobTitle: u.jobTitle ?? "" };
  });
}

export async function setUiLocaleAction(locale: "en" | "es") {
  const session = await requireSession("/app/account");
  return runAction(async () => {
    await updateProfile(db, session.user.id, { uiLocale: locale });
    // Setting a cookie re-renders the page in the new language in the same roundtrip.
    (await cookies()).set("fl_ui_locale", locale, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
  });
}
