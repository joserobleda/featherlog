"use client";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorSelection, EditorState } from "@codemirror/state";
import { drawSelection, EditorView, keymap, placeholder as cmPlaceholder } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

export type MarkdownEditorHandle = {
  focus(): void;
  /** Wraps the selection (or inserts `placeholder`) with `before`/`after`. */
  wrap(before: string, after?: string, placeholder?: string): void;
  /** Toggles a prefix on every selected line (e.g. "## ", "- ", "> "). */
  linePrefix(prefix: string): void;
  /** Inserts a block on its own paragraph at the cursor. */
  insertBlock(text: string): void;
  /** Replaces the first occurrence of `search` (used to swap upload placeholders). */
  replaceText(search: string, replacement: string): void;
  getValue(): string;
};

const highlight = HighlightStyle.define([
  { tag: tags.heading, fontWeight: "700" },
  { tag: tags.heading1, fontSize: "1.25em" },
  { tag: tags.heading2, fontSize: "1.12em" },
  { tag: tags.strong, fontWeight: "700" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.link, color: "var(--color-brand)" },
  { tag: tags.url, color: "var(--fg-muted)" },
  { tag: tags.monospace, fontFamily: "var(--font-mono)", color: "#d63384" },
  { tag: tags.quote, color: "var(--fg-muted)", fontStyle: "italic" },
  { tag: [tags.processingInstruction, tags.meta], color: "var(--fg-muted)" },
  { tag: tags.list, color: "var(--color-brand)" },
]);

const theme = EditorView.theme({
  "&": { fontSize: "14.5px", height: "100%", backgroundColor: "transparent" },
  ".cm-scroller": { fontFamily: "var(--font-sans)", lineHeight: "1.65", padding: "4px 0" },
  ".cm-content": { caretColor: "var(--fg)", padding: "0" },
  "&.cm-focused": { outline: "none" },
  ".cm-line": { padding: "0" },
  ".cm-placeholder": { color: "var(--fg-muted)", opacity: "0.7" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": {
    backgroundColor: "color-mix(in srgb, var(--color-brand) 22%, transparent) !important",
  },
});

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onUploadFiles?: (files: File[]) => void;
  ariaLabel?: string;
};

export const MarkdownEditor = forwardRef<MarkdownEditorHandle, Props>(function MarkdownEditor(
  { value, onChange, placeholder, onUploadFiles, ariaLabel },
  ref,
) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onUploadRef = useRef(onUploadFiles);
  onChangeRef.current = onChange;
  onUploadRef.current = onUploadFiles;

  useEffect(() => {
    if (!host.current) return;
    const images = (list: FileList | null | undefined) =>
      Array.from(list ?? []).filter((f) => f.type.startsWith("image/"));
    const v: EditorView = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          drawSelection(),
          EditorView.lineWrapping,
          markdown({ base: markdownLanguage }),
          syntaxHighlighting(highlight),
          theme,
          cmPlaceholder(placeholder ?? ""),
          EditorView.contentAttributes.of({ "aria-label": ariaLabel ?? "Markdown editor", spellcheck: "true" }),
          keymap.of([
            { key: "Mod-b", run: (): boolean => (wrapIn(v, "**", "**", "bold"), true) },
            { key: "Mod-i", run: (): boolean => (wrapIn(v, "_", "_", "italic"), true) },
            { key: "Mod-k", run: (): boolean => (wrapIn(v, "[", "](https://)", "link"), true) },
            ...defaultKeymap,
            ...historyKeymap,
            indentWithTab,
          ]),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onChangeRef.current(u.state.doc.toString());
          }),
          EditorView.domEventHandlers({
            paste(e) {
              const files = images(e.clipboardData?.files);
              if (files.length && onUploadRef.current) {
                e.preventDefault();
                onUploadRef.current(files);
                return true;
              }
              return false;
            },
            drop(e, editor) {
              const files = images(e.dataTransfer?.files);
              if (files.length && onUploadRef.current) {
                e.preventDefault();
                const pos = editor.posAtCoords({ x: e.clientX, y: e.clientY });
                if (pos != null) editor.dispatch({ selection: { anchor: pos } });
                onUploadRef.current(files);
                return true;
              }
              return false;
            },
          }),
        ],
      }),
    });
    view.current = v;
    return () => {
      v.destroy();
      view.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // External value changes (e.g. switching language tab) replace the document.
  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
    }
  }, [value]);

  useImperativeHandle(ref, () => ({
    focus: () => view.current?.focus(),
    wrap: (before, after = before, ph = "") => view.current && wrapIn(view.current, before, after, ph),
    linePrefix: (prefix) => view.current && toggleLinePrefix(view.current, prefix),
    insertBlock: (text) => view.current && insertBlock(view.current, text),
    replaceText: (search, replacement) => {
      const v = view.current;
      if (!v) return;
      const idx = v.state.doc.toString().indexOf(search);
      if (idx >= 0) v.dispatch({ changes: { from: idx, to: idx + search.length, insert: replacement } });
    },
    getValue: () => view.current?.state.doc.toString() ?? "",
  }));

  return <div ref={host} className="h-full min-h-64 cursor-text" />;
});

function wrapIn(v: EditorView, before: string, after: string, ph: string) {
  v.dispatch(
    v.state.changeByRange((range) => {
      const text = v.state.sliceDoc(range.from, range.to) || ph;
      const insert = `${before}${text}${after}`;
      return {
        changes: { from: range.from, to: range.to, insert },
        range: EditorSelection.range(range.from + before.length, range.from + before.length + text.length),
      };
    }),
  );
  v.focus();
}

function toggleLinePrefix(v: EditorView, prefix: string) {
  const { state } = v;
  const lines = new Set<number>();
  for (const r of state.selection.ranges) {
    for (let n = state.doc.lineAt(r.from).number; n <= state.doc.lineAt(r.to).number; n++) lines.add(n);
  }
  const all = [...lines].map((n) => state.doc.line(n));
  const remove = all.every((l) => l.text.startsWith(prefix));
  const changes = all.map((l, i) => {
    const p = prefix === "1. " ? `${i + 1}. ` : prefix;
    return remove ? { from: l.from, to: l.from + prefix.length, insert: "" } : { from: l.from, insert: p };
  });
  v.dispatch({ changes });
  v.focus();
}

function insertBlock(v: EditorView, text: string) {
  const { state } = v;
  const pos = state.selection.main.head;
  const line = state.doc.lineAt(pos);
  const atLineStart = line.text.trim() === "";
  const before = state.sliceDoc(0, atLineStart ? line.from : line.to);
  const prefix = before.length === 0 ? "" : before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
  const from = atLineStart ? line.from : line.to;
  const insert = `${prefix}${text}\n\n`;
  v.dispatch({ changes: { from, to: atLineStart ? line.to : line.to, insert }, selection: { anchor: from + insert.length } });
  v.focus();
}
