import { SkateRush } from "@/components/games/skate-rush/skate-rush";
import { GAME } from "@/components/games/skate-rush/manifest";
import { PlayPage, playMetadata } from "@/components/games/play-page";

export const metadata = playMetadata(GAME);

export default function Page() {
  return <PlayPage game={GAME} Player={SkateRush} />;
}
