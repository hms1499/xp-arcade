import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "XP Snake",
  description: "Snake game with Stacks blockchain integration, themed as a Windows 95 desktop",
  other: {
    "talentapp:project_verification":
      "f375b3af3138ef065829701c915a457a21d4db3a6d1aa17d8ee34f782b61b62890fefa3d07b9f514ec76c6a62f9910490ac8fce3ea9a3f0f6cc9f9129b4a6e99",
  },
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
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
