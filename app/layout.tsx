import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "LabMitra - Lab Report Samjho",
  description: "Lab report upload karo, apni bhasha mein samjho",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="hi">
      <body>{children}</body>
    </html>
  );
}
