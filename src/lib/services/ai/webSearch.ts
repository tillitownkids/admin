import Anthropic from '@anthropic-ai/sdk';
import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ContentBlock,
  type ConverseCommandOutput,
  type Message,
} from '@aws-sdk/client-bedrock-runtime';

/**
 * Brave-backed `web_search` tool the model can call while answering.
 * Enabled only when BRAVE_SEARCH_API_KEY is set; callers opt in per request.
 */

export interface AiCallOptions {
  webSearch?: boolean;
  /** Sampling temperature; 0 for checks that must give the same answer every run. The model's default when absent. */
  temperature?: number;
}

const TOOL_NAME = 'web_search';
const TOOL_DESCRIPTION =
  'Search the web with Brave Search. Use it when the answer depends on facts you do not reliably know: ' +
  'current events, real places, festivals, customs, animals, science facts, or anything that may have changed recently. ' +
  'Returns result titles, URLs and text snippets. Do not use it for pure creative writing.';
const TOOL_INPUT_SCHEMA: { type: 'object'; properties: Record<string, Record<string, string | number>>; required: string[] } = {
  type: 'object',
  properties: {
    query: { type: 'string', description: 'The search query, as you would type it into a search engine.' },
    count: { type: 'integer', minimum: 1, maximum: 10, description: 'Number of results to return (default 5).' },
  },
  required: ['query'],
};

// Searches the model may run per request; further calls get a "limit reached" result.
const MAX_SEARCHES = 5;
// Model turns per request, so a model that keeps calling the tool cannot loop forever.
const MAX_ROUNDS = MAX_SEARCHES + 2;

export function isWebSearchEnabled(options?: AiCallOptions): boolean {
  return Boolean(options?.webSearch && process.env.BRAVE_SEARCH_API_KEY);
}

interface BraveWebResult {
  title?: string;
  url?: string;
  description?: string;
  age?: string;
  extra_snippets?: string[];
}

const stripTags = (text: string) => text.replace(/<[^>]+>/g, '');

export async function braveWebSearch(query: string, count = 5): Promise<string> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) throw new Error('BRAVE_SEARCH_API_KEY is not set.');

  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  url.searchParams.set('q', query.slice(0, 400));
  url.searchParams.set('count', String(Math.min(Math.max(Math.trunc(count) || 5, 1), 10)));
  url.searchParams.set('safesearch', 'strict');
  url.searchParams.set('extra_snippets', 'true');

  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'X-Subscription-Token': apiKey },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Brave Search error (${response.status}): ${body.slice(0, 300)}`);
  }

  const data = await response.json();
  const results: BraveWebResult[] = data?.web?.results ?? [];
  if (results.length === 0) return `No web results found for "${query}".`;

  return results
    .map((result, i) => {
      const lines = [`[${i + 1}] ${stripTags(result.title || 'Untitled')}`, result.url || ''];
      if (result.age) lines.push(`Published: ${result.age}`);
      if (result.description) lines.push(stripTags(result.description));
      for (const snippet of result.extra_snippets?.slice(0, 2) ?? []) lines.push(stripTags(snippet));
      return lines.filter(Boolean).join('\n');
    })
    .join('\n\n');
}

/** Runs one tool call. Failures go back to the model as an error result instead of failing the request. */
async function runTool(name: string | undefined, input: unknown, searchesUsed: number): Promise<{ text: string; isError: boolean }> {
  if (name !== TOOL_NAME) return { text: `Unknown tool "${name}".`, isError: true };
  if (searchesUsed >= MAX_SEARCHES) {
    return { text: 'Search limit reached for this request. Answer now with the information you already have.', isError: true };
  }
  const { query, count } = (input ?? {}) as { query?: unknown; count?: unknown };
  if (typeof query !== 'string' || !query.trim()) return { text: 'The "query" field is required.', isError: true };

  try {
    return { text: await braveWebSearch(query, typeof count === 'number' ? count : 5), isError: false };
  } catch (err) {
    console.error('web_search tool failed:', err);
    return { text: `Search failed: ${err instanceof Error ? err.message : String(err)}`, isError: true };
  }
}

/** Bedrock Converse with the web_search tool. Returns the final (non tool_use) response. */
export async function converseWithWebSearch(
  client: BedrockRuntimeClient,
  modelId: string,
  prompt: string,
  maxTokens?: number,
): Promise<ConverseCommandOutput> {
  const messages: Message[] = [{ role: 'user', content: [{ text: prompt }] }];
  let searchesUsed = 0;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const response = await client.send(
      new ConverseCommand({
        modelId,
        messages,
        ...(maxTokens ? { inferenceConfig: { maxTokens } } : {}),
        toolConfig: {
          tools: [{ toolSpec: { name: TOOL_NAME, description: TOOL_DESCRIPTION, inputSchema: { json: TOOL_INPUT_SCHEMA } } }],
        },
      }),
    );
    if (response.stopReason !== 'tool_use') return response;

    const assistantContent = response.output?.message?.content ?? [];
    messages.push({ role: 'assistant', content: assistantContent });

    const toolUses = assistantContent.flatMap((block) => (block.toolUse ? [block.toolUse] : []));
    const results = await Promise.all(
      toolUses.map((toolUse) => runTool(toolUse.name, toolUse.input, searchesUsed++)),
    );
    messages.push({
      role: 'user',
      content: toolUses.map((toolUse, i): ContentBlock => ({
        toolResult: {
          toolUseId: toolUse.toolUseId,
          content: [{ text: results[i].text }],
          status: results[i].isError ? 'error' : 'success',
        },
      })),
    });
  }
  throw new Error('The model kept calling web_search without finishing its answer.');
}

/** Anthropic Messages API with the web_search tool. Returns the final (non tool_use) message. */
export async function claudeWithWebSearch(
  client: Anthropic,
  model: string,
  prompt: string,
  maxTokens: number,
): Promise<Anthropic.Message> {
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: prompt }];
  const tools: Anthropic.Tool[] = [
    { name: TOOL_NAME, description: TOOL_DESCRIPTION, input_schema: TOOL_INPUT_SCHEMA },
  ];
  let searchesUsed = 0;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    // Large output budgets require streaming in the Anthropic SDK.
    const response = await client.messages.stream({ model, max_tokens: maxTokens, messages, tools }).finalMessage();
    if (response.stop_reason !== 'tool_use') return response;

    messages.push({ role: 'assistant', content: response.content });

    const toolUses = response.content.filter((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use');
    const results = await Promise.all(
      toolUses.map((toolUse) => runTool(toolUse.name, toolUse.input, searchesUsed++)),
    );
    messages.push({
      role: 'user',
      content: toolUses.map((toolUse, i): Anthropic.ToolResultBlockParam => ({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: results[i].text,
        is_error: results[i].isError,
      })),
    });
  }
  throw new Error('The model kept calling web_search without finishing its answer.');
}
