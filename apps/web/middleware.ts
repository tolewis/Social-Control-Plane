import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public paths — don't gate these
  if (
    pathname === '/login' ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/backend/') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/integrations/')
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get('scp-token')?.value;
  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
