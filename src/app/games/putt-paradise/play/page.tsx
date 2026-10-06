import { PuttParadise } from "@/components/games/putt-paradise/putt-paradise";
import { GAME } from "@/components/games/putt-paradise/manifest";
import { PlayPage, playMetadata } from "@/components/games/play-page";

export const metadata = playMetadata(GAME);

export default function Page() {
  return <PlayPage game={GAME} Player={PuttParadise} />;
}
