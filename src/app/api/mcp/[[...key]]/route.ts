import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';

import { createTillitownMcpServer } from '@/lib/mcp/server';

// The MCP endpoint Claude connects to. It is outside the admin's sign-in (see src/middleware.ts) and
// checks MCP_ACCESS_TOKEN instead, given either as "Authorization: Bearer <token>" at /api/mcp or in
// the path as /api/mcp/<token> for clients that cannot send headers (claude.ai custom connectors).

export const maxDuration = 60;

function digest(value: string) {
  return createHash('sha256').update(value).digest();
}

function authorized(request: NextRequest, key: string[] | undefined): boolean {
  const expected = process.env.MCP_ACCESS_TOKEN;
  if (!expected) return false;
  const header = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const given = header || (key?.length === 1 ? key[0] : '');
  return Boolean(given) && timingSafeEqual(digest(given), digest(expected));
}

function unauthorized(message: string, status = 401) {
  return Response.json({ jsonrpc: '2.0', error: { code: -32001, message }, id: null }, { status });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ key?: string[] }> }) {
  if (!process.env.MCP_ACCESS_TOKEN) return unauthorized('The MCP endpoint is turned off: MCP_ACCESS_TOKEN is not set.', 503);
  if (!authorized(request, (await params).key)) return unauthorized('Missing or wrong MCP access token.');

  // Stateless: a fresh server per request, so it runs on serverless functions without shared memory.
  const server = createTillitownMcpServer({ origin: request.nextUrl.origin });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  return transport.handleRequest(request);
}

// No server-initiated stream and no sessions to end in stateless mode.
function methodNotAllowed() {
  return new Response(null, { status: 405, headers: { Allow: 'POST' } });
}

export { methodNotAllowed as GET, methodNotAllowed as DELETE };
