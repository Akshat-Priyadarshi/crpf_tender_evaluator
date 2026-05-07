// ─────────────────────────────────────────────────────────────────────────────
// NavbarWrapper.tsx
//
// layout.tsx is a Server Component and cannot call usePathname() directly.
// This thin client wrapper reads the current path and suppresses the Navbar
// on the /login route so the login page renders full-screen without chrome.
// ─────────────────────────────────────────────────────────────────────────────
"use client";

import { usePathname } from "next/navigation";
import Navbar from "./Navbar";

const ROUTES_WITHOUT_NAVBAR = ["/login"];

export default function NavbarWrapper() {
  const pathname = usePathname();

  if (ROUTES_WITHOUT_NAVBAR.includes(pathname)) {
    return null;
  }

  return <Navbar />;
}
