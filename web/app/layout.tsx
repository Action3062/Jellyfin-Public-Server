import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { LanguageProvider } from "../components/LanguageProvider";
import { shopName } from "../lib/site";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  weight: ["400", "500", "600", "700", "800"]
});

export const metadata: Metadata = {
  title: {
    default: `${shopName} — Private Streaming`,
    template: `%s · ${shopName}`
  },
  description:
    "Privater Jellyfin & Plex Streaming-Server. Anonym bezahlen mit Krypto oder Azteco. / Private Jellyfin & Plex streaming server. Pay anonymously with crypto or Azteco."
};

export const viewport: Viewport = {
  themeColor: "#0a0a0f",
  width: "device-width",
  initialScale: 1
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" suppressHydrationWarning>
      <body className={inter.variable}>
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
