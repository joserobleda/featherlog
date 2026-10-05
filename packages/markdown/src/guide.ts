/** Concise Markdown reference for end users and AI agents (editor help, MCP resource). */
export const MARKDOWN_GUIDE = `# Featherlog Markdown guide

Changelog posts are written in Markdown (CommonMark + GitHub Flavored Markdown).
Raw HTML is not allowed: HTML tags are removed from the output.

## Text
- **bold**, *italic*, ~~strikethrough~~, \`inline code\`
- Headings: \`# H1\` through \`###### H6\`
- Blockquote: start a line with \`> \`
- Horizontal rule: \`---\` on its own line
- Line break: end a line with two spaces or a backslash

## Lists
- Bullets: \`- item\` (or \`*\`, \`+\`)
- Numbered: \`1. item\`
- Task lists: \`- [ ] todo\` and \`- [x] done\`

## Links
- \`[text](https://example.com)\` or \`[text][ref]\` with \`[ref]: https://example.com\`
- Bare URLs (\`https://example.com\`) and \`<https://example.com>\` become links automatically.
- Only http, https and mailto links are allowed. External links open in a new tab.

## Images
- \`![Alt text](https://example.com/image.png)\` (http/https URLs only)
- Size in pixels: \`![Alt](image.png =300x200)\`
- Width only, auto height: \`![Alt](image.png =300x*)\`
- Other units: \`![Alt](image.png =80%x5em)\` (px, %, em, rem, vw, vh)

## Videos
Paste a YouTube, Vimeo, Loom or Wistia URL on its own line (or at the end of a line of
text) and it is embedded as a player:

    https://www.youtube.com/watch?v=dQw4w9WgXcQ
    https://youtu.be/dQw4w9WgXcQ
    https://vimeo.com/76979871
    https://www.loom.com/share/<id>
    https://yourname.wistia.com/medias/<id>

- Image syntax also embeds a video and lets you set a title and size:
  \`![Product tour](https://vimeo.com/76979871 =640x360)\`
- To show a plain link instead of a player, use link syntax: \`[https://youtu.be/…](https://youtu.be/…)\`

## Categories
A paragraph containing only category names in square brackets tags the post with those
categories and renders them as labels:

    [New] [Improvement]

Names are case-insensitive and must match an existing category; unknown names stay as text.

## Tables
    | Feature | Status |
    | ------- | :----: |
    | Search  | Done   |

## Code
Inline code uses backticks. Code blocks use triple backticks with an optional language for
syntax highlighting (js, ts, jsx, tsx, json, bash, html, css, python, go, ruby, php, java,
sql, yaml, diff, markdown):

    \`\`\`ts
    const greeting: string = "hello";
    \`\`\`
`;
