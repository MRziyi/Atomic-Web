import type { Metadata } from "next";
import { Inter, Newsreader, JetBrains_Mono, Caveat } from "next/font/google";
import "./globals.css";

// Font setup — see Design_v1.md §E.1
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

// Caveat is loaded but should ONLY be used for atom titles (1-3 words),
// never body. See Design_v1.md §E.1 — readability fix from demo.
const caveat = Caveat({
  subsets: ["latin"],
  variable: "--font-caveat",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Atomic Ideation",
  description:
    "A multi-user asynchronous research ideation canvas — atoms, connections, and emergent subtopics.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${newsreader.variable} ${jetbrainsMono.variable} ${caveat.variable}`}
    >
      <body className="bg-paper text-ink antialiased font-sans">{children}</body>
    </html>
  );
}
