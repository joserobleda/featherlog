import { env } from "./env";

/** Absolute URL of a workspace's public changelog (optionally a locale and/or a post path). */
export function publicUrl(slug: string, path = "") {
  return `${env.PUBLIC_URL}/${slug}${path}`;
}

export function appUrl(path = "") {
  return `${env.APP_URL}${path}`;
}

export function widgetUrl(path = "") {
  return `${env.WIDGET_URL}${path}`;
}

export function hostOf(url: string) {
  return new URL(url).host;
}
