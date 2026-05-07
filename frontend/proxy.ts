// ─────────────────────────────────────────────────────────────────────────────
// middleware.ts — Route Protection
//
// This file runs on the Next.js Edge Runtime before ANY page is rendered.
// It checks for the 'crpf_auth' cookie on every request.
// If the cookie is missing, the user is redirected to /login immediately —
// the protected page never loads, not even partially.
//
// This is middleware-level protection — it cannot be bypassed by typing
// a URL directly into the browser, unlike per-page redirect checks.
//
// TEAMMATE TODO (when real JWT auth is built):
//   Replace the simple cookie presence check with JWT verification.
//   import { jwtVerify } from 'jose';
//   Verify the token value against your secret key.
//   If verification fails (expired / tampered), redirect to /login.
//   This prevents a user from setting a fake 'crpf_auth' cookie manually.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Routes that do NOT require authentication
const PUBLIC_ROUTES = ["/login"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public routes through without any check
  if (PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // Check for auth cookie
  const isAuthenticated = request.cookies.has("crpf_auth");

  if (!isAuthenticated) {
    // Redirect to login, preserving the originally requested URL
    // so after login we can send the officer back to where they were going
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

// Tell Next.js which routes this middleware applies to.
// Excludes static files, images, and Next.js internals automatically.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.png|.*\\.svg|.*\\.jpg).*)",
  ],
};
