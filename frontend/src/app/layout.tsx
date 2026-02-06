import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { StarknetProvider } from "@/providers/StarknetProvider";
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
  title: "Pokerstarks — ZK Poker on Starknet",
  description: "Provably fair poker with zero-knowledge proofs on Starknet",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <StarknetProvider>{children}</StarknetProvider>
      </body>
    </html>
  );
}
