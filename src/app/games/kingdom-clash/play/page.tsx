import type { Viewport } from "next";
import { KingdomClash } from "@/components/games/kingdom-clash/kingdom-clash";
import { GAME } from "@/components/games/kingdom-clash/manifest";
import { PlayPage, playMetadata } from "@/components/games/play-page";
import { SITE } from "@/lib/site";

export const metadata = playMetadata(GAME);

/** Phones: the village fills the screen beside a notch too; the HUD keeps clear of it (safe-area insets). */
export const viewport: Viewport = {
  themeColor: SITE.themeColor,
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function Page() {
  return <PlayPage game={GAME} Player={KingdomClash} />;
}
