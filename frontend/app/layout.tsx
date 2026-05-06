import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";

export const metadata: Metadata = {
  title: "CRPF Tender Evaluation Platform",
  description: "AI-Based Tender Evaluation & Eligibility Analysis for Government Procurement",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Navbar />
        <main style={{ minHeight: "calc(100vh - 56px)" }}>
          {children}
        </main>
      </body>
    </html>
  );
}