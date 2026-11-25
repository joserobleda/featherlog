"use server";
import {
  removeSubscriber,
  type SubscriberStatus,
  setSubscriberStatus,
  type UpsertSubscriberInput,
  upsertSubscribersBatch,
} from "@featherlog/core";
import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions";
import { getWorkspaceContext } from "@/lib/session";

export async function setSubscriberStatusAction(ws: string, id: string, status: SubscriberStatus) {
  const { ctx, workspace } = await getWorkspaceContext(ws);
  return runAction(async () => {
    await setSubscriberStatus(ctx, id, status);
    revalidatePath(`/app/${workspace.slug}/settings/subscribers`);
  });
}

export async function removeSubscriberAction(ws: string, id: string) {
  const { ctx, workspace } = await getWorkspaceContext(ws);
  return runAction(async () => {
    await removeSubscriber(ctx, { id });
    revalidatePath(`/app/${workspace.slug}/settings/subscribers`);
  });
}

/** One chunk of a CSV import (the browser parses the file and sends it in batches). */
export async function importSubscribersAction(ws: string, items: UpsertSubscriberInput[]) {
  const { ctx, workspace } = await getWorkspaceContext(ws);
  return runAction(async () => {
    const counts = await upsertSubscribersBatch(ctx, items, { source: "import" });
    revalidatePath(`/app/${workspace.slug}/settings/subscribers`);
    return counts;
  });
}
