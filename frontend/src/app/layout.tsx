import type { Metadata } from "next";
import { StarknetProvider } from "@/providers/StarknetProvider";
import BrandedTerminalBackground from "@/components/effects/BrandedTerminalBackground";
import "./globals.css";

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
      <body className="antialiased">
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
