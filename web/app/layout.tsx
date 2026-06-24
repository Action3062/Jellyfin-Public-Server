import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  weight: ["400", "500", "600", "700", "800"]
});

export const metadata: Metadata = {
  title: "Payment Portal",
  description: "Crypto and Azteco payment portal for Jellyfin subscriptions"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" suppressHydrationWarning>
      <body className={inter.variable}>{children}</body>
    </html>
  );
}
