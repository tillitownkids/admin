import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  // Claude connects to the MCP endpoint without an admin session; the route checks its own token.
  const { pathname } = request.nextUrl
  if (pathname === '/api/mcp' || pathname.startsWith('/api/mcp/')) return NextResponse.next()
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images/assets with extensions (svg|png|jpg|jpeg|gif|webp)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}