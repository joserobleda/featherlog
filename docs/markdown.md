# Writing posts: Markdown guide

Posts are written in Markdown: CommonMark plus GitHub Flavored Markdown, with a few changelog extras for categories, video embeds and image sizing. The same guide is available to AI agents as the MCP resource `featherlog://guide/markdown`.

**Raw HTML isn't allowed.** HTML tags are removed from the output, which is then sanitized. Posts can't contain scripts or styles.

## Categories

To tag a post, write a paragraph that contains **only** category names in square brackets:

```markdown
[New] [Improvement]

Dashboards now load twice as fast, and you can pin your favorite ones.
```

- The paragraph is replaced by colored labels, and the post is tagged with those categories, both on the public page and in the widget.
- Names are case-insensitive and must match an existing category (**Settings → Categories**). Unknown names stay as plain text.
- Write category names in the language of the translation you're editing, for example `[Nuevo]` in Spanish. Names in other languages are also recognized.
- New workspaces start with **New**, **Improvement** and **Fix**.

## Text

```markdown
**bold**, *italic*, ~~strikethrough~~, `inline code`

# Heading 1
## Heading 2
### Heading 3   (down to ######)

> A blockquote

---   (horizontal rule)
```

End a line with two spaces or a backslash `\` to force a line break.

## Lists

```markdown
- Bullet (or * or +)
- Another

1. Numbered
2. Steps

- [ ] Task to do
- [x] Task done
```

## Links

```markdown
[Read the docs](https://example.com/docs)
[Read the docs][docs]

[docs]: https://example.com/docs

https://example.com  ← bare URLs become links
<https://example.com>
```

Only `http`, `https` and `mailto` links are allowed. External links open in a new tab.

## Images

```markdown
![Alt text](https://example.com/screenshot.png)
```

Upload images in the editor (drag and drop or paste), or use any public `http`/`https` URL. Uploaded images are converted to WebP and resized to a maximum width of 2000 px. Animated GIFs are kept as they are.

### Image sizing

Add `=WIDTHxHEIGHT` before the closing parenthesis (Headway-compatible):

```markdown
![Alt](https://example.com/image.png =300x200)    300 × 200 px
![Alt](https://example.com/image.png =300x*)      300 px wide, height auto
![Alt](https://example.com/image.png =*x120)      120 px tall, width auto
![Alt](https://example.com/image.png =80%x5em)    other units
```

Supported units: `px` (the default), `%`, `em`, `rem`, `vw`, `vh`, `ch`. Use `*` or `auto` to leave one side automatic.

## Videos

Paste a YouTube, Vimeo, Loom or Wistia URL **on its own line** (or at the end of a line of text) and it is embedded as a player:

```markdown
https://www.youtube.com/watch?v=dQw4w9WgXcQ
https://youtu.be/dQw4w9WgXcQ?t=42
https://vimeo.com/76979871
https://www.loom.com/share/<id>
https://yourname.wistia.com/medias/<id>
```

- YouTube is embedded through `youtube-nocookie.com`. Shorts, `/live/` and `/embed/` URLs work too, and `t=`/`start=` sets the start time.
- To set a title and size, use image syntax:
  ```markdown
  ![Product tour](https://vimeo.com/76979871 =640x360)
  ```
- To show a plain link instead of a player, use link syntax:
  ```markdown
  [https://youtu.be/dQw4w9WgXcQ](https://youtu.be/dQw4w9WgXcQ)
  ```

## Tables

```markdown
| Feature | Status |
| ------- | :----: |
| Search  | Done   |
| Export  | Beta   |
```

Use `:---`, `:---:` and `---:` to align columns left, center or right.

## Code

Inline code uses backticks: `` `npm install` ``. Code blocks use triple backticks with an optional language for syntax highlighting:

````markdown
```ts
const greeting: string = "hello";
```
````

Highlighted languages: `js`, `ts`, `jsx`, `tsx`, `json`, `bash`, `html`, `css`, `python`, `go`, `ruby`, `php`, `java`, `sql`, `yaml`, `diff`, `markdown`.

## Excerpts

The widget list shows an excerpt generated from the beginning of the post (the API returns it too). Put the most important sentence first.
