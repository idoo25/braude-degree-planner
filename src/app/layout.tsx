import type { Metadata } from "next";
import { IBM_Plex_Sans_Hebrew, IBM_Plex_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const plexSansHebrew = IBM_Plex_Sans_Hebrew({
  variable: "--font-plex-sans-hebrew",
  subsets: ["hebrew", "latin"],
  weight: ["400", "500", "600", "700"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "מפת תואר הנדסת תוכנה | Braude",
  description: "מחשבון נקודות זכות ותנאי קדם לתואר בהנדסת תוכנה בבראודה",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="he"
      dir="rtl"
      className={`${plexSansHebrew.variable} ${plexMono.variable} h-full`}
    >
      <body className="flex min-h-full flex-col antialiased">
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
