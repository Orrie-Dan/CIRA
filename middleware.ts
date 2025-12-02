import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  
  // Protected routes
  const protectedRoutes = ['/admin', '/officer']
  const isProtectedRoute = protectedRoutes.some(route => pathname.startsWith(route))
  
  if (isProtectedRoute) {
    // Since we're using localStorage for tokens (cross-domain setup),
    // we can't check authentication in middleware (server-side can't access localStorage).
    // The client-side pages already handle authentication checks and redirects properly.
    // Allow the request to proceed and let the page component handle auth validation.
    return NextResponse.next()
  }
  
  return NextResponse.next()
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/officer/:path*',
  ],
}

