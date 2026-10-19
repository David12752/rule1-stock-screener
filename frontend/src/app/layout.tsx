import type { Metadata } from "next";
import { Rubik, Heebo, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AppChrome } from "@/components/app-chrome";

const rubik = Rubik({
  variable: "--font-rubik",
  subsets: ["latin", "hebrew"],
  weight: ["400", "500", "600", "700"],
});

const heebo = Heebo({
  variable: "--font-heebo",
  subsets: ["latin", "hebrew"],
  weight: ["300", "400", "500", "600"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "כלל 1# — Workspace",
  description: "סביבת עבודה מאוחדת: איכות Rule #1 + תזמון טכני",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl" className="dark">
      <body
        className={`${rubik.variable} ${heebo.variable} ${jetbrainsMono.variable} antialiased`}
      >
        <AppChrome>{children}</AppChrome>
      </body>
    </html>
  );
}
