import { PRODUCT_NAME } from "@/lib/brand";

export function HomeHeroIntro() {
  return (
    <p className="md:text-xl text-sm text-left mt-2 max-w-2xl text-white/80 leading-relaxed">
      Set rules for AI and trading bots on <strong className="text-white font-medium">Injective testnet</strong>.
      {PRODUCT_NAME} blocks anything outside your limits before it reaches the exchange. You approve one
      timed wallet permission in Keplr — about three minutes.
    </p>
  );
}
