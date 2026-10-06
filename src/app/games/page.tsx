import Link from "next/link";
import { Boxes, Music, Smartphone } from "lucide-react";
import { GameCard } from "@/components/game-card";
import { Eyebrow } from "@/components/ui";
import { formatNumber } from "@/lib/catalog";
import { androidApp } from "@/lib/game-apps";
import { gameModels } from "@/lib/game-models";
import { games } from "@/lib/games";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Free 3D Browser Games — Made Only from Our Free 3D Models",
  description:
    "Play free 3D games in your browser — an endless skate runner, tower defense, naval battles, a dungeon roguelite, a burger cooking rush and a hex puzzle — every one built only from the free 3D models in this library.",
  path: "/games/",
});

export default function GamesPage() {
  const playable = games.filter((g) => !g.comingSoon);
  const upcoming = games.filter((g) => g.comingSoon);
  const perGame = playable.map((game) => ({ game, models: gameModels(game) }));
  const allModels = new Set(perGame.flatMap((g) => g.models.map((m) => m.slug)));
  const allPacks = new Set(perGame.flatMap((g) => g.models.map((m) => m.collectionKey)));
  const genres = new Set(playable.map((g) => g.genre));

  return (
    <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 sm:pt-12">
      <header className="mb-10 max-w-3xl space-y-4">
        <Eyebrow>Play</Eyebrow>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">3D games made from our models</h1>
        <p className="text-base leading-relaxed text-muted sm:text-lg">
          Every game here is built <strong className="font-semibold text-fg">only from the free 3D models in this library</strong> — the same
          characters, vehicles, buildings, props and terrain pieces you can download on this site. Nothing to install: they run in your browser
          with a keyboard, mouse or touch screen, with music and sound generated live in code.
        </p>
      </header>

      <dl className="mb-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Games", value: playable.length },
          { label: "Genres", value: genres.size },
          { label: "Library models used", value: allModels.size },
          { label: "Model packs", value: allPacks.size },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-line bg-surface px-5 py-4">
            <dt className="text-xs text-subtle">{s.label}</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">{formatNumber(s.value)}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {perGame.map(({ game, models }, i) => (
          <GameCard key={game.slug} game={game} modelCount={models.length} priority={i < 3} android={!!androidApp(game.slug)} />
        ))}
      </div>

      {upcoming.length > 0 && (
        <section className="mt-16">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Coming soon</h2>
          <p className="mt-1.5 text-sm text-muted">
            {upcoming.length} more games are being built the same way — only from the models in this library.
          </p>
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {upcoming.map((game) => (
              <GameCard key={game.slug} game={game} modelCount={gameModels(game).length} />
            ))}
          </div>
        </section>
      )}

      <section className="mt-20 mb-4">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">How these games are made</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {[
            {
              icon: Boxes,
              title: "Only library models",
              text: "Every character, animation, vehicle, building and prop is a model from this library (CC0 and MIT). Each game's page lists the exact models it uses — open any of them to download it yourself.",
            },
            {
              icon: Music,
              title: "Music made in code",
              text: "Each game has its own soundtrack — a sea shanty, a dungeon march, a diner bossa — synthesized live with the Web Audio API and building up as the action gets intense. Toggle music (M) and sound (N) separately.",
            },
            {
              icon: Smartphone,
              title: "Runs anywhere",
              text: "Built with three.js. Play with keyboard and mouse, or touch controls on a phone; best scores are saved in your browser. Models stream in with a live progress bar and stay cached while you play.",
            },
          ].map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-2xl border border-line bg-surface p-5">
              <Icon className="size-5 text-accent" />
              <h3 className="mt-3 font-semibold text-fg">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{text}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 text-sm text-muted">
          Want to make your own?{" "}
          <Link href="/builder/" className="text-fg underline underline-offset-2 hover:text-accent">
            Compose a scene in the builder
          </Link>{" "}
          or{" "}
          <Link href="/models/" className="text-fg underline underline-offset-2 hover:text-accent">
            browse all models
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
