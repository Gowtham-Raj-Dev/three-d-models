import { SiegeSmash } from "@/components/games/siege-smash/siege-smash";
import { GAME } from "@/components/games/siege-smash/manifest";
import { PlayPage, playMetadata } from "@/components/games/play-page";

export const metadata = playMetadata(GAME);

export default function Page() {
  return <PlayPage game={GAME} Player={SiegeSmash} />;
}
