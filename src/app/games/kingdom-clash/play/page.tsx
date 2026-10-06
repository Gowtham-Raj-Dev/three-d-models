import { KingdomClash } from "@/components/games/kingdom-clash/kingdom-clash";
import { GAME } from "@/components/games/kingdom-clash/manifest";
import { PlayPage, playMetadata } from "@/components/games/play-page";

export const metadata = playMetadata(GAME);

export default function Page() {
  return <PlayPage game={GAME} Player={KingdomClash} />;
}
