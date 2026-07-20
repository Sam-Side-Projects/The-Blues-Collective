import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import TopNav from "@/components/TopNav";
import Footer from "@/components/Footer";
import NextFixtureBanner from "@/components/NextFixtureBanner";
import { siteUrl } from "@/lib/siteUrl";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // metadataBase makes social preview images resolve to absolute URLs, which
  // Facebook and X require. Without it, shared links show no picture.
  metadataBase: new URL(siteUrl()),
  title: "The Blues Collective",
  description:
    "An unofficial community for Chelsea fans — build lineups, debate, and predict.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <TopNav />
        <NextFixtureBanner />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
