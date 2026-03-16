import type { Metadata } from "next";
import { Syne, Instrument_Sans, DM_Mono } from "next/font/google";
import "./globals.css";
import AuthProvider from "@/components/AuthProvider";

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-syne",
  weight: ["400", "700", "800"],
});

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument",
  weight: ["400", "500"],
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  variable: "--font-dm-mono",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "VEKTOR Intelligence",
  description: "Direction for every mind.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
  className={`${syne.variable} ${instrumentSans.variable} ${dmMono.variable} antialiased`}
  suppressHydrationWarning={true}
>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}