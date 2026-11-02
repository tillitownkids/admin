import { z } from 'zod';

import { ToolError } from '@/lib/mcp/data';

// Shared pieces of the MCP tools: replies, error handling, annotations and prompt checks.

export type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean };

function reply(value: unknown): ToolResult {
  return { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] };
}

/** Runs a tool body; a failure comes back to Claude as a readable error instead of a protocol error. */
export async function run(body: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return reply(await body());
  } catch (error) {
    if (!(error instanceof ToolError)) console.error('MCP tool failed:', error);
    const message = error instanceof Error ? error.message : typeof error === 'object' && error && 'message' in error ? String(error.message) : 'The tool failed.';
    return { content: [{ type: 'text', text: message }], isError: true };
  }
}

export const READ = { readOnlyHint: true, openWorldHint: false } as const;
export const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;
export const REPLACE = { readOnlyHint: false, destructiveHint: true, openWorldHint: false } as const;

export const episodeId = z.string().uuid().describe('Episode (story) id from list_episodes.');
export const sequenceId = z.string().uuid().describe('Sequence id from get_episode.');
export const names = (what: string) => z.array(z.string()).optional().describe(`${what}, by exact name.`);

const FORBIDDEN_STYLE_WORDS = /\b(hand-drawn|pencil|sketch|line art|drawing|illustration|storybook)\b/i;

/** Problems in a storyboard prompt that the image step is known to stumble on. */
export function storyboardPromptWarnings(label: string, prompt: string, beatCount: number): string[] {
  const warnings: string[] = [];
  const style = prompt.replace(/zero line art|zero pencil lines/gi, '').match(FORBIDDEN_STYLE_WORDS);
  if (style) warnings.push(`${label}: "${style[0]}" can make the image model draw a 2D sketch; remove it.`);
  if (!/\bPanel 1\s*:/i.test(prompt)) warnings.push(`${label}: no "Panel 1:" line, so the video step cannot match clips to panels.`);
  for (let panel = 1; panel <= beatCount; panel++) {
    if (!new RegExp(`\\bPanel ${panel}\\s*:`, 'i').test(prompt)) warnings.push(`${label}: missing "Panel ${panel}:" for its beat ${panel}.`);
  }
  const words = prompt.split(/\s+/).filter(Boolean).length;
  if (words > 330) warnings.push(`${label}: ${words} words; keep it under 300 for a cleaner image.`);
  return warnings;
}

export function adminUrl(origin: string, storyId: string, step: string) {
  return `${origin}/episodes/${storyId}/${step}`;
}

export function sequenceUrl(origin: string, storyId: string, number: number) {
  return `${adminUrl(origin, storyId, 'sequences')}/${number}`;
}
