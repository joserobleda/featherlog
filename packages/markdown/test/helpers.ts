import { type RenderOptions, renderMarkdown } from "../src";

/** Render without highlighting (fast path) and return the HTML. */
export async function html(md: string, opts: RenderOptions = {}): Promise<string> {
  return (await renderMarkdown(md, { highlight: false, ...opts })).html;
}
