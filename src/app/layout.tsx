import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Talking Head",
  description: "A face for ChatGPT. Speak to it and it speaks back.",
};

export const viewport: Viewport = {
  themeColor: "#0a0a0b",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="h-full overflow-hidden bg-neutral-950 text-neutral-100">
        {children}
      </body>
    </html>
  );
}
