import { BEAT_HEADER } from '@/lib/sceneShots';

// Scripts are saved as markdown when generated and as HTML once edited in the script editor.
// Everything that reads beats works on the markdown form.

/** The markdown form of a saved script or story. Markdown passes through unchanged. */
export function stripHtmlToMarkdown(text: string): string {
  if (!text) return "";
  if (!/<[a-z][\s\S]*>/i.test(text)) return text;

  let cleaned = text;
  cleaned = cleaned.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, "\n# $1\n");
  cleaned = cleaned.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "\n## $1\n");
  cleaned = cleaned.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, "\n### $1\n");
  cleaned = cleaned.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, "**$1**");
  cleaned = cleaned.replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, "**$1**");
  cleaned = cleaned.replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, "*$1*");
  cleaned = cleaned.replace(/<u[^>]*>([\s\S]*?)<\/u>/gi, "$1");
  cleaned = cleaned.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, "$1\n\n");
  cleaned = cleaned.replace(/<br\s*\/?>/gi, "\n");
  cleaned = cleaned.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "- $1\n");
  cleaned = cleaned.replace(/<\/?ul[^>]*>/gi, "\n");
  cleaned = cleaned.replace(/<\/?ol[^>]*>/gi, "\n");
  cleaned = cleaned.replace(/<[^>]+>/g, "");
  cleaned = cleaned
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  return cleaned.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * The script with the given beats' blocks replaced by new text. Each block runs from its "BEAT N"
 * header to the next header; the blank lines and "---" separator that close it are kept. Beats not in
 * `replacements` are untouched. Returns the beat numbers that were not found in the script.
 */
export function replaceBeatBlocks(markdown: string, replacements: Map<number, string>): { text: string; missing: number[] } {
  const lines = (markdown || '').replaceAll('\r\n', '\n').split('\n');
  const out: string[] = [];
  const found = new Set<number>();
  let segment: string[] | null = null;
  let segmentBeat: number | null = null;
  const flush = () => {
    if (!segment) return;
    const replacement = segmentBeat !== null && !found.has(segmentBeat) ? replacements.get(segmentBeat) : undefined;
    if (replacement === undefined) {
      out.push(...segment);
    } else {
      found.add(segmentBeat!);
      let end = segment.length;
      while (end > 1 && /^\s*(?:-{3,})?\s*$/.test(segment[end - 1])) end--;
      out.push(...replacement.replaceAll('\r\n', '\n').trim().split('\n'), ...segment.slice(end));
    }
    segment = null;
  };
  for (const line of lines) {
    const header = line.match(BEAT_HEADER);
    if (header) {
      flush();
      segment = [line];
      segmentBeat = Number(header[1]);
    } else if (segment) {
      segment.push(line);
    } else {
      out.push(line);
    }
  }
  flush();
  return { text: out.join('\n'), missing: [...replacements.keys()].filter((beat) => !found.has(beat)) };
}

/**
 * Each beat's own text in a markdown script, verbatim, from its "BEAT N" header up to the next
 * header, without the "---" separators around it.
 */
export function scriptBeatBlocks(markdown: string): Map<number, string> {
  const lines = (markdown || '').replaceAll('\r\n', '\n').split('\n');
  const blocks = new Map<number, string>();
  let current: { beat: number; lines: string[] } | null = null;
  const close = () => {
    if (!current) return;
    const body = [...current.lines];
    while (body.length && /^\s*(?:-{3,})?\s*$/.test(body[body.length - 1])) body.pop();
    if (!blocks.has(current.beat)) blocks.set(current.beat, body.join('\n'));
  };
  for (const line of lines) {
    const header = line.match(BEAT_HEADER);
    if (header) {
      close();
      current = { beat: Number(header[1]), lines: [line] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  close();
  return blocks;
}
