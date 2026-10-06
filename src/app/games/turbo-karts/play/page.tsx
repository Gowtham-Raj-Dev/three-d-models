import { TurboKarts } from "@/components/games/turbo-karts/turbo-karts";
import { GAME } from "@/components/games/turbo-karts/manifest";
import { PlayPage, playMetadata } from "@/components/games/play-page";

export const metadata = playMetadata(GAME);

export default function Page() {
  return <PlayPage game={GAME} Player={TurboKarts} />;
}
