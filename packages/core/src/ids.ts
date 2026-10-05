import { customAlphabet } from "nanoid";

const alnum = "0123456789abcdefghijklmnopqrstuvwxyz";
const id = customAlphabet(alnum, 20);
const shortId = customAlphabet(alnum, 8);
const mixed = customAlphabet("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz", 8);

export const newId = () => id();
/** Short, URL-friendly id used in public post URLs (`/acme/my-post-ab12cd34`). */
export const newPostPublicId = () => shortId();
/** Public account id used by the widget snippet. */
export const newWorkspacePublicId = () => mixed();

export function slugify(input: string, maxLength = 80): string {
  const slug = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
  return slug || "post";
}
