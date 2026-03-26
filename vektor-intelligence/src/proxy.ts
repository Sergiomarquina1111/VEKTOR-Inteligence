import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * VEKTOR Intelligence — Proxy (Next.js 16 middleware)
 *
 * Intentionally minimal. Firebase Auth manages its own session
 * client-side via onAuthStateChanged + IndexedDB. It does NOT set
 * a cookie called "vektor-auth" — so any cookie check here will
 * always fail and block every navigation.
 *
 * Auth-gating is handled correctly inside dashboard/layout.tsx via
 * useEffect + onAuthStateChanged. This proxy just passes all requests
 * through cleanly without interference.
 */
export function proxy(request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api|.*\\..*).*)",
  ],
};