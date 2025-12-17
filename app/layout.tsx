import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Overlap Detector",
  description: "Anonymous overlap detector for relationship links",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
}
