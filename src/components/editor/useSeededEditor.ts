"use client";

import { useEffect, useRef, type MutableRefObject } from "react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EditorRef = MutableRefObject<any>;

/**
 * Keeps a Tiptap editor's content in step with loaded HTML without ever losing edits. The cached
 * text shows at once; when a background refresh brings different text, it replaces the editor's
 * content only while the editor still holds exactly what was last loaded or saved. Once the text is
 * edited (by typing or by accepting an AI rewrite), refreshes leave it alone until `markSaved`.
 */
export function useSeededEditor(editorRef: EditorRef, html: string | null) {
  // The editor's HTML right after the last load or save; null before the first.
  const baseline = useRef<string | null>(null);
  // The loaded HTML last handled, so the same text is never applied twice.
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (html === null || html === handled.current) return;
    const apply = () => {
      const editor = editorRef.current;
      if (!editor) return false;
      handled.current = html;
      const current: string = editor.getHTML();
      if (baseline.current !== null && current !== baseline.current) return true; // edited: keep it
      if (current !== html) editor.commands.setContent(html);
      baseline.current = editor.getHTML();
      return true;
    };
    if (apply()) return;
    // The editor mounts once loading ends, a moment after the data arrives.
    const timer = setTimeout(apply, 150);
    return () => clearTimeout(timer);
  }, [editorRef, html]);

  return {
    /**
     * The editor's text was just saved. `loadedHtml` is what the cache will hold for it, so that
     * text arriving from the cache is not applied over the editor (which would move the cursor).
     */
    markSaved: (loadedHtml: string) => {
      baseline.current = editorRef.current?.getHTML() ?? null;
      handled.current = loadedHtml;
    },
  };
}
