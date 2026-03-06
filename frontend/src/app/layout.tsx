import type { Metadata } from "next";
import { StarknetProvider } from "@/providers/StarknetProvider";
import BrandedTerminalBackground from "@/components/effects/BrandedTerminalBackground";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "https://frontend-seven-beta-93.vercel.app",
  ),
  title: "Pokerstarks — ZK Poker on Starknet",
  description: "Provably fair poker with zero-knowledge proofs on Starknet",
  openGraph: {
    title: "Pokerstarks — ZK Poker on Starknet",
    description: "Provably fair poker with zero-knowledge proofs on Starknet",
    images: [{ url: "/logo.png", width: 512, height: 512 }],
  },
  twitter: {
    card: "summary",
    title: "Pokerstarks — ZK Poker on Starknet",
    description: "Provably fair poker with zero-knowledge proofs on Starknet",
    images: ["/logo.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <div className="crt-overlay crt-flicker" />
        <div className="relative min-h-screen bg-[#080b12]">
          <div
            className="pointer-events-none fixed inset-0 z-0 bg-cover bg-center bg-no-repeat"
            style={{ backgroundImage: "url('/retro/backgrounds/bg-image.png')" }}
          />
          <BrandedTerminalBackground />
          <div className="relative z-20 min-h-screen">
            <StarknetProvider>{children}</StarknetProvider>
          </div>
        </div>
      </body>
    </html>
  );
}
