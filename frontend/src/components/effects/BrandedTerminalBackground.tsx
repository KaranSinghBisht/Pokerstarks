"use client";

import FaultyTerminal from "./FaultyTerminal";

export default function BrandedTerminalBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 z-10">
      <FaultyTerminal
        scale={1.4}
        gridMul={[2, 1]}
        digitSize={1.15}
        timeScale={0.42}
        pause={false}
        scanlineIntensity={0.42}
        glitchAmount={1.02}
        flickerAmount={0.45}
        noiseAmp={0.85}
        chromaticAberration={0.15}
        dither={0.1}
        curvature={0.08}
        tint="#00D9F5"
        mouseReact={false}
        mouseStrength={0}
        pageLoadAnimation
        brightness={0.24}
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,0,255,0.06),transparent_42%),radial-gradient(circle_at_80%_70%,rgba(0,217,245,0.05),transparent_46%),linear-gradient(180deg,rgba(8,11,18,0.54),rgba(8,11,18,0.68))]" />
    </div>
  );
}
