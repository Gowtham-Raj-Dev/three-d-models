/**
 * TAIL=1 for the trailer scripts: record only the last shot again (a new end card) and splice it onto the trailers
 * already in public/games/<game>/. Everything before the last shot and the whole soundtrack are copied as they are,
 * so nothing else changes and no voice-over is needed.
 *
 * It relies on the last shot starting on a cut: the encoder put a keyframe there in both files, so the part before
 * it can be copied without re-encoding.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/** The first frame of the last shot: the first n with n / fps at or past its start (as the directors' frame(n) picks shots). */
export function tailStart(starts, fps) {
  const start = starts.at(-1);
  let n = Math.floor(start * fps);
  while (n / fps < start) n++;
  return n;
}

/**
 * Encodes the frames from `from` on (framesDir/00000.jpg …, at `fps`) like the trailer scripts do, and replaces the
 * end of out/trailer-1080.mp4 and out/trailer.mp4 with them.
 */
export function spliceTail({ ffmpeg: bin, out, work, framesDir, from, fps, crf = [22, 25] }) {
  const ffmpeg = (args) => {
    const r = spawnSync(bin, ["-y", "-loglevel", "error", ...args], { stdio: "inherit" });
    if (r.status !== 0) throw new Error(`ffmpeg failed: ${args.join(" ").slice(0, 200)}`);
  };
  const input = ["-framerate", String(fps), "-start_number", String(from), "-i", path.join(framesDir, "%05d.jpg"), "-pix_fmt", "yuv420p", "-profile:v", "high"];
  const versions = [
    ["trailer-1080.mp4", fps, ["-c:v", "libx264", "-preset", "slow", "-crf", String(crf[0]), "-g", String(fps * 2)]],
    ["trailer.mp4", 30, ["-vf", "fps=30,scale=1280:720:flags=lanczos", "-c:v", "libx264", "-preset", "slow", "-crf", String(crf[1])]],
  ];
  for (const [name, rate, codec] of versions) {
    const old = path.join(out, name);
    const [head, tail, joined] = ["head-", "tail-", ""].map((p) => path.join(work, p + name));
    const list = path.join(work, `${name}.txt`);
    // Cut by frame count: a cut by time takes a frame or two of the old last shot along (B-frame reordering).
    ffmpeg(["-i", old, "-map", "0:v", "-c", "copy", "-frames:v", String(Math.ceil((from * rate) / fps)), head]);
    ffmpeg([...input, ...codec, tail]);
    fs.writeFileSync(list, [head, tail].map((f) => `file '${f.split(path.sep).join("/")}'\n`).join(""));
    ffmpeg(["-f", "concat", "-safe", "0", "-i", list, "-i", old, "-map", "0:v", "-map", "1:a", "-c", "copy", "-movflags", "+faststart", joined]);
    fs.copyFileSync(joined, old);
    console.log(`${name}  ${(fs.statSync(old).size / 1024 / 1024).toFixed(2)} MB`);
  }
}
