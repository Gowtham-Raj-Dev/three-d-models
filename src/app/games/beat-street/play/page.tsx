import { BeatStreet } from "@/components/games/beat-street/beat-street";
import { GAME } from "@/components/games/beat-street/manifest";
import { PlayPage, playMetadata } from "@/components/games/play-page";

export const metadata = playMetadata(GAME);

export default function Page() {
  return <PlayPage game={GAME} Player={BeatStreet} />;
}
