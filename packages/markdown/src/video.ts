export type VideoProvider = "youtube" | "vimeo" | "loom" | "wistia";
export type VideoInfo = { provider: VideoProvider; id: string; embedUrl: string };

const YT_ID = /^[A-Za-z0-9_-]{6,20}$/;
const VIMEO_ID = /^\d{3,12}$/;
const VIMEO_HASH = /^[A-Za-z0-9]{4,32}$/;
const LOOM_ID = /^[A-Za-z0-9]{8,64}$/;
const WISTIA_ID = /^[A-Za-z0-9]{4,32}$/;

const PROVIDER_LABEL: Record<VideoProvider, string> = {
  youtube: "YouTube video",
  vimeo: "Vimeo video",
  loom: "Loom video",
  wistia: "Wistia video",
};

export function videoLabel(provider: VideoProvider): string {
  return PROVIDER_LABEL[provider];
}

/** Parses `t`/`start` values like `90`, `90s`, `1m30s`, `1h2m3s` into seconds. */
function parseStart(value: string | null): number | null {
  if (!value) return null;
  if (/^\d+$/.test(value)) return Number(value) || null;
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value);
  if (!m || (!m[1] && !m[2] && !m[3])) return null;
  const secs = Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  return secs || null;
}

function youtube(id: string | undefined, url: URL): VideoInfo | null {
  if (!id || !YT_ID.test(id)) return null;
  const start = parseStart(url.searchParams.get("t") ?? url.searchParams.get("start"));
  return {
    provider: "youtube",
    id,
    embedUrl: `https://www.youtube-nocookie.com/embed/${id}${start ? `?start=${start}` : ""}`,
  };
}

/**
 * Recognizes YouTube, Vimeo, Loom and Wistia URLs and returns a privacy-friendly embed URL.
 * Returns `null` for anything else (including malformed URLs).
 */
export function parseVideoUrl(input: string): VideoInfo | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const parts = url.pathname.split("/").filter(Boolean);

  // YouTube
  if (host === "youtu.be") return youtube(parts[0], url);
  if (
    host === "youtube.com" ||
    host === "m.youtube.com" ||
    host === "music.youtube.com" ||
    host === "youtube-nocookie.com"
  ) {
    if (parts[0] === "watch" && parts.length === 1) {
      return youtube(url.searchParams.get("v") ?? undefined, url);
    }
    if (
      (parts[0] === "shorts" || parts[0] === "embed" || parts[0] === "live" || parts[0] === "v") &&
      parts.length === 2
    ) {
      return youtube(parts[1], url);
    }
    return null;
  }

  // Vimeo
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    let id: string | undefined;
    let hash: string | undefined;
    if (host === "player.vimeo.com") {
      if (parts[0] !== "video" || parts.length !== 2) return null;
      id = parts[1];
      hash = url.searchParams.get("h") ?? undefined;
    } else {
      if (parts.length < 1 || parts.length > 2) return null;
      id = parts[0];
      hash = parts[1];
    }
    if (!id || !VIMEO_ID.test(id)) return null;
    if (hash !== undefined && !VIMEO_HASH.test(hash)) return null;
    return {
      provider: "vimeo",
      id,
      embedUrl: `https://player.vimeo.com/video/${id}${hash ? `?h=${hash}` : ""}`,
    };
  }

  // Loom
  if (host === "loom.com") {
    if ((parts[0] !== "share" && parts[0] !== "embed") || parts.length !== 2) return null;
    const id = parts[1];
    if (!id || !LOOM_ID.test(id)) return null;
    return { provider: "loom", id, embedUrl: `https://www.loom.com/embed/${id}` };
  }

  // Wistia
  if (host === "wistia.com" || host.endsWith(".wistia.com") || host === "fast.wistia.net") {
    let id: string | undefined;
    if (host === "fast.wistia.net") {
      if (parts[0] !== "embed" || parts[1] !== "iframe" || parts.length !== 3) return null;
      id = parts[2];
    } else {
      if (parts[0] !== "medias" || parts.length !== 2) return null;
      id = parts[1];
    }
    if (!id || !WISTIA_ID.test(id)) return null;
    return { provider: "wistia", id, embedUrl: `https://fast.wistia.net/embed/iframe/${id}` };
  }

  return null;
}
