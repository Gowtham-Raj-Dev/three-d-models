/**
 * Tutorial: the builder's "Haunted backyard", built by hand from an empty plot.
 *
 * A first visit to the builder opens that very scene, so the script reads it (every part's place,
 * turn, size and animation), starts a new empty project, and rebuilds it step by step with the
 * tools a person would use — the Array tool, Ctrl+D, Shift+click stamping, the inspector — ending
 * with the same scene. It is built in Day lighting (at night the bare floor can hardly be seen) and
 * turned to Night for the lights at the end.
 *
 * `lines` is the narration: `say` is what the voice reads, `sub` the caption when it should be
 * written differently (numbers, key names). `run` is the choreography; it paces itself by the
 * length of each spoken line, so a new voice only needs a new recording.
 */

export const meta = {
  id: "haunted-backyard",
  title: "Build a haunted backyard from an empty plot — Scene Builder tutorial",
  route: "/builder/",
};

/** The intro flies over the finished scene with the side panels out of the way. */
export const before = `(() => {
  try {
    if (!localStorage.getItem("tutorial-seeded")) {
      localStorage.setItem("tutorial-seeded", "1");
      localStorage.setItem("scene-builder:layout", JSON.stringify({ left: false, right: false, leftWidth: 304, rightWidth: 304 }));
    }
  } catch {}
})()`;

export const lines = {
  "intro-1": { say: "Let's build this haunted backyard in the Scene Builder. A fenced graveyard, a crypt, glowing lanterns, and skeletons that actually move." },
  "intro-2": { say: "We'll start from an empty plot, and build it step by step. It's free, and it runs right in your browser." },

  "new-1": { say: "Step one. Click New project. Give it a name, keep Empty plot and Day lighting, and create it. Daylight is easier to build in. We'll switch to night at the end." },
  "new-2": {
    say: "With nothing selected, the panel on the right shows the scene settings. Change the ground to Dark, and make it a hundred and sixty metres wide.",
    sub: "With nothing selected, the panel on the right shows the scene settings. Change the ground to Dark, and make it 160 m wide.",
  },

  "floor-1": {
    say: "Step two, the floor. The Halloween kit is already open on the left. Set the grid step to four metres. These floor tiles are four metres wide, so now they will snap together perfectly.",
    sub: "Step two, the floor. The Halloween kit is already open on the left. Set the grid step to 4 m. These floor tiles are 4 m wide, so now they will snap together perfectly.",
  },
  "floor-2": { say: "Pick Floor Dirt, and click in the scene to drop the first tile in the far corner." },
  "ground-1": {
    say: "It flickers, because its top is level with the ground. Press Escape, and lower the ground level to minus zero point five. Now the floor stands clear.",
    sub: "It flickers, because its top is level with the ground. Press Esc, and lower the ground level to −0.5. Now the floor stands clear.",
  },
  "floor-3": {
    say: "The tile is selected, so the inspector shows its settings. Scroll down to the Array tool, and ask for nine copies, four metres apart. That's one full row.",
    sub: "The tile is selected, so the inspector shows its settings. Scroll down to the Array tool, and ask for 9 copies, 4 m apart. That's one full row.",
  },
  "floor-4": {
    say: "Press Control A to select the whole row, Control D to duplicate it, then nudge the copy into place with the arrow keys. Repeat until the floor is done.",
    sub: "Press Ctrl+A to select the whole row, Ctrl+D to duplicate it, then nudge the copy into place with the arrow keys. Repeat until the floor is done.",
  },
  "floor-5": { say: "For the open grave, click one tile, delete it, and drop a Floor Dirt Grave in the gap." },
  "grave-2": { say: "It lands on the lowered ground, so set its Y position back to zero.", sub: "It lands on the lowered ground, so set its Y position back to 0." },
  "floor-6": {
    say: "Press Control A, then L, to lock the floor, so you can't move it by accident.",
    sub: "Press Ctrl+A, then L, to lock the floor, so you can't move it by accident.",
  },

  "fence-1": {
    say: "Step three, the fence. Set the grid step to two metres. Pick Fence, drop one piece on the back edge, and array it. Seven copies, four metres apart.",
    sub: "Step three, the fence. Set the grid step to 2 m. Pick Fence, drop one piece on the back edge, and array it. 7 copies, 4 m apart.",
  },
  "fence-2": {
    say: "For the sides, pick the fence again, and press Shift and right bracket to turn it ninety degrees before you click. This time, array it along Z instead of X.",
    sub: "For the sides, pick the fence again, and press Shift + ] to turn it 90° before you click. This time, array it along Z instead of X.",
  },
  "fence-3": { say: "Do the same on the other side and along the front, leaving a gap in the middle for the Arch Gate." },
  "fence-4": { say: "Then put a Fence Pillar on every joint. Hold Shift while you click, and the part stays in your hand." },
  "fence-5": { say: "Swap a few pieces for the broken versions, so it all looks old." },

  "path-1": {
    say: "Step four. Set the grid step to half a metre for finer work, and lay a path from the gate towards the back. There are four path pieces, so mix them up.",
    sub: "Step four. Set the grid step to 0.5 m for finer work, and lay a path from the gate towards the back. There are four path pieces, so mix them up.",
  },
  "crypt-1": { say: "To find any part quickly, just search for it. Type crypt, and place it at the end of the path. Then add skull candles and candle clusters by its door." },

  "graves-1": { say: "Step five, the graves. Place them in two blocks, either side of the path. Hold Shift to stamp a few, then switch to another headstone, so no two rows look the same." },
  "graves-2": { say: "Add a coffin by the open grave, another near the crypt, and a bench and a candle shrine along the side fences." },

  "skel-1": { say: "Step six, the residents. Switch to the Skeletons kit, and drop a Skeleton Warrior beside the path." },
  "skel-2": { say: "Animated parts get an Animation menu in the inspector. Search for Idle Combat, and pick it. Now he's ready for a fight." },
  "skel-3": {
    say: "Use the square bracket keys to turn him, fifteen degrees at a time.",
    sub: "Use the square bracket keys to turn him, 15° at a time.",
  },
  "skel-4": { say: "Add a mage casting a spell, a rogue, and two minions. For the one at the open grave, choose Skeletons Awaken Floor Long, and he will claw his way out of the ground, over and over." },

  "night-1": { say: "Step eight, light. Press three to switch the scene to night. Dark, isn't it? Let's fix that.", sub: "Step eight, light. Press 3 to switch the scene to night. Dark, isn't it? Let's fix that." },
  "light-1": { say: "Stand a Post Lantern on each side of the gate." },
  "light-2": { say: "The lantern is only a model. To make it glow, click Point light at the top of the parts list, and drop one next to it." },
  "light-3": { say: "In the inspector, raise it to the lamp with the Y position. You can also change its colour, power and range, and flame flicker makes it dance like a real candle." },
  "light-4": { say: "Give every lantern, candle and pumpkin its own small light. That's what makes a night scene feel alive." },

  "trees-1": { say: "Step seven, dress the scene. Back in the Halloween kit, put dead trees inside the fence, and autumn pines outside it. Press plus or minus to resize a selected part." },
  "scatter-1": { say: "For small clutter, place one pumpkin, then use Scatter. It drops copies at random spots, sizes and angles, with no overlaps. Do the same with bones and candles." },

  "end-1": {
    say: "And that's the haunted backyard. Hide the side panels, and press Shift F to frame the whole scene.",
    sub: "And that's the haunted backyard. Hide the side panels, and press Shift+F to frame the whole scene.",
  },
  "end-2": { say: "Drag to orbit, right drag to pan, and scroll to zoom.", sub: "Drag to orbit, right-drag to pan, and scroll to zoom." },
  "end-3": {
    say: "When you're happy, click Export. You get a single G L B file with every animation inside, ready for Blender, Unity, Godot or three J S. Or a zip, with the project file and the licences.",
    sub: "When you're happy, click Export. You get a single GLB file with every animation inside, ready for Blender, Unity, Godot or three.js. Or a zip, with the project file and the licences.",
  },
  "end-4": { say: "Short on time? New project also has Haunted backyard as a ready made template. Have fun building!", sub: "Short on time? New project also has Haunted backyard as a ready-made template. Have fun building!" },
};

const H = (name) => `halloween-bits-${name}`;
const SK = (name) => `character-pack-skeletons-${name}`;

/** Views: { position, target }. With both panels open the 3D view is about 990 × 855 px. */
const CAM = {
  hero: { position: [11, 15, 31], target: [0, 1.5, 0] },
  top: { position: [0, 44, 30], target: [0, 0, 1] },
  grave: { position: [15, 15, 24], target: [8, 0, 8] },
  path: { position: [10, 21, 30], target: [0, 0, 3] },
  graves: { position: [-5, 23, 27], target: [0, 0, 2.5] },
  warrior: { position: [5, 7, 18], target: [-1.6, 1.2, 5.6] },
  crew: { position: [10, 13, 25], target: [1, 1, 4] },
  digger: { position: [10.5, 5.5, 15.5], target: [5.2, 0.9, 8.6] },
  gate: { position: [7.5, 7.5, 27], target: [0, 1.6, 11.5] },
  yard: { position: [10, 17, 32], target: [0, 1, 3] },
  wide: { position: [13, 37, 43], target: [0, 0, 0] },
};

const gridStep = async (d, step) => {
  await d.press({ sel: 'button[title="Grid step"]' }, { ring: true, after: 0.3 });
  await d.press({ sel: "[role=option]", text: step }, { seconds: 0.4 });
};
const kit = (d, name) => d.press({ sel: "button[aria-pressed]", text: name, exact: true }, { ring: true, after: 0.4 });

export async function run(d) {
  // The finished scene, read from the builder itself.
  const scene = await d.doc();
  const all = scene.items;
  const is = (...names) => (i) => names.includes(i.part);
  const at = (i, x, z, r = 0.7) => Math.hypot(i.position[0] - x, i.position[2] - z) < r;
  const used = new Set();
  /** The scene's items passing `test` that no earlier step has placed. */
  const take = (test) => {
    const got = all.filter((i) => !used.has(i) && test(i));
    for (const i of got) used.add(i);
    return got;
  };
  const current = async () => (await d.doc()).items;
  const view = await d.call("view");
  const centre = { x: view.l + view.w / 2, y: view.t + view.h / 2 };

  // --- Intro: the finished scene --------------------------------------------------------------------
  d.timeline.chapters.push({ t: 0, label: "The finished scene" });
  d.titleCard({ eyebrow: "Scene Builder tutorial", title: "Build a Haunted Backyard", sub: "From an empty plot, step by step", foot: "models.codelove.in/builder" }, 4.6, { fadeIn: 0, fadeOut: 0.8, dim: 0.74 });
  await d.call("setCamera", { target: CAM.hero.target, position: [20.5, 15, 25.6] });
  await d.orbit(-0.1, 1.2);
  await d.say("intro-1", 0);
  await d.orbit(-0.42, d.line.seconds + 0.4);
  await d.say("intro-2", 0);
  await d.orbit(-0.26, d.line.seconds + 0.5);

  // --- Step 1: a new project ------------------------------------------------------------------------
  await d.say("new-1");
  d.chapter("STEP 1", "Start a new project");
  await d.press({ sel: 'button[aria-label="Show panel"]' }, { seconds: 0.5, after: 0.1 });
  await d.press({ sel: 'button[aria-label="Show inspector"]' }, { seconds: 0.5, after: 0.1 });
  await d.cue(0.08);
  await d.press({ sel: 'button[aria-label="New project"]' }, { ring: true, after: 0.5 });
  await d.poll(`!!document.querySelector("[role=dialog] input")`);
  await d.cue(0.16);
  await d.type("My haunted backyard", 16);
  await d.cue(0.3);
  await d.move({ sel: "[role=dialog] label", text: "Empty plot" }, 0.5);
  d.highlight({ sel: "[role=dialog] label", text: "Empty plot" }, 1.2, 2);
  await d.cue(0.4);
  await d.move({ sel: "[role=dialog] [role=radio]", text: "Day" }, 0.5);
  d.highlight({ sel: "[role=dialog] [role=radio]", text: "Day" }, 1.2);
  await d.cue(0.52);
  await d.press({ sel: "[role=dialog] button[type=submit]" }, { ring: true, after: 0.6 });
  if ((await current()).length) throw new Error("the new project isn't empty");

  await d.say("new-2");
  d.highlight({ sel: "aside", idx: 1 }, 2.4, -3);
  await d.cue(0.5);
  await d.dropdown("Ground", "Dark");
  await d.cue(0.78);
  await d.field("Size", 160);
  if ((await d.doc()).ground.size !== 160 || (await d.doc()).ground.kind !== "dark") await d.dispatch({ type: "scene", patch: { ground: { kind: "dark", size: 160, y: 0 } } });

  // --- Step 2: the floor ----------------------------------------------------------------------------
  const tiles = take((i) => /floor_dirt/.test(i.part ?? ""));
  const tileAt = (x, z) => tiles.find((i) => at(i, x, z));
  const pit = tiles.find(is(H("floor_dirt_grave")));

  await d.say("floor-1");
  d.chapter("STEP 2", "Lay the floor");
  await d.camera(CAM.top, 2.2);
  d.highlight({ sel: "button[aria-pressed]", text: "Halloween", exact: true }, 1.8);
  await d.move({ sel: "button[aria-pressed]", text: "Halloween", exact: true }, 0.6);
  await d.cue(0.4);
  await gridStep(d, "4 m");

  await d.say("floor-2");
  await d.pick(H("floor_dirt"), { ring: true });
  await d.cue(0.5);
  const firstTile = tileAt(-16, -16);
  await d.place(firstTile, { seconds: 0.9, after: 0.3 });

  // On the ground the tile's top and the ground share a height and fight over every pixel: a look
  // from close by, then the ground goes down half a metre (everything laid from here keeps y = 0).
  await d.say("ground-1");
  await d.camera({ position: [-8, 6.5, -3], target: [-16, 0, -16] }, 1.6);
  await d.cue(0.4);
  await d.key("Escape", { show: ["Esc"], after: 0.4 });
  await d.cue(0.52);
  await d.field("Level", "-0.5");
  if ((await d.doc()).ground.y !== -0.5) await d.dispatch({ type: "scene", patch: { ground: { kind: "dark", size: 160, y: -0.5 } } });
  await d.spoken(0.2);
  await d.camera(CAM.top, 1.4);
  await d.move({ world: firstTile.position }, 0.5);
  await d.click();
  await d.wait(0.3);

  await d.say("floor-3");
  d.highlight({ sel: "aside", idx: 1 }, 2, -3);
  await d.cue(0.3);
  await d.reveal({ field: "Copies" }, 0.9);
  await d.cue(0.48);
  await d.field("Copies", 9);
  d.highlight({ field: "Step X" }, 1.6);
  await d.move({ field: "Step X" }, 0.4);
  await d.cue(0.8);
  let before = new Set(await d.call("ids"));
  await d.press({ sel: "button", text: "Make 9 in a row" }, { ring: true, after: 0.5 });
  await d.adopt(before, tiles, { only: ["rotation"] });

  await d.say("floor-4");
  await d.move({ world: [0, 0, 2] }, 0.6);
  await d.key("Control+a", { show: ["Ctrl", "A"], after: 0.5 });
  /** Ctrl+D copies the selection 4 m along X; two arrow keys put the copy in the next row. */
  const nextRow = async (fast) => {
    const had = new Set(await d.call("ids"));
    await d.key("Control+d", { show: ["Ctrl", "D"], seconds: fast ? 0.45 : 1.1, after: fast ? 0.13 : 0.55 });
    // Turn the copies' textures like the finished floor's — a detail nobody would do by hand.
    const fresh = (await current()).filter((i) => !had.has(i.id));
    await d.dispatch({ type: "updateMany", patches: fresh.map((i) => ({ id: i.id, patch: { rotation: (tileAt(i.position[0] - 4, i.position[2] + 4) ?? i).rotation } })) });
    await d.key("ArrowLeft", { show: ["←"], seconds: fast ? 0.45 : 0.9, after: fast ? 0.13 : 0.45 });
    await d.key("ArrowDown", { show: ["↓"], seconds: fast ? 0.45 : 0.9, after: fast ? 0.16 : 0.55 });
  };
  await d.cue(0.3);
  await nextRow(false);
  await d.cue(0.82);
  d.timelapse("Time-lapse");
  for (let row = 2; row < 9; row++) await nextRow(true);
  d.timelapse(null);
  await d.key("Escape", { after: 0.2 });
  {
    const laid = await current();
    const ok = laid.length === 81 && tiles.every((t) => laid.some((i) => at(i, t.position[0], t.position[2], 0.1)));
    if (!ok) throw new Error(`the floor came out wrong (${laid.length} tiles)`);
  }

  await d.say("floor-5");
  await d.camera(CAM.grave, 1.5);
  await d.move({ world: [8, 0, 8] }, 0.5);
  await d.click();
  await d.cue(0.4);
  await d.key("Delete", { show: ["Del"], after: 0.4 });
  {
    const left = (await current()).find((i) => at(i, 8, 8, 0.1));
    if (left) await d.dispatch({ type: "remove", ids: [left.id] });
  }
  await d.pick(H("floor_dirt_grave"), { ring: true });
  // Its click falls through the gap onto the ground, half a metre down.
  const pitId = await d.place(pit, { seconds: 0.7, after: 0.4, keep: ["position"] });
  await d.dispatch({ type: "update", id: pitId, patch: { position: [pit.position[0], -0.5, pit.position[2]] } });

  await d.say("grave-2");
  await d.cue(0.4);
  await d.field("Y", 0);
  if ((await current()).find((i) => i.id === pitId)?.position[1] !== 0) await d.dispatch({ type: "update", id: pitId, patch: { position: pit.position } });
  await d.spoken(0.2);

  await d.say("floor-6");
  await d.camera(CAM.top, 1.5);
  await d.move({ world: [-2, 0, 4] }, 0.4);
  await d.key("Control+a", { show: ["Ctrl", "A"], after: 0.7 });
  await d.cue(0.4);
  await d.key("l", { show: ["L"], after: 0.6 });
  {
    const open = (await current()).filter((i) => !i.locked);
    if (open.length) await d.dispatch({ type: "updateMany", patches: open.map((i) => ({ id: i.id, patch: { locked: true } })) });
  }
  await d.key("Escape", { after: 0.2 });
  await d.spoken(0.1);
  await d.camera({ position: [20, 9, 27], target: [6, 0, 9] }, 1.6);
  await d.orbit(-0.2, 1.8);

  // --- Step 3: the fence ----------------------------------------------------------------------------
  const fences = take(is(H("fence"), H("fence_broken")));
  const pillars = take(is(H("fence_pillar"), H("fence_pillar_broken")));
  const [gate] = take(is(H("arch_gate")));
  const side = (test) => fences.filter(test).sort((a, b) => a.position[0] - b.position[0] || a.position[2] - b.position[2]);
  const backRow = side((i) => i.position[2] < -13), frontRow = side((i) => i.position[2] > 13);
  const leftRow = side((i) => i.position[0] < -13), rightRow = side((i) => i.position[0] > 13);
  /** Arrayed pieces that the finished scene has as the broken part: swapped by hand later. */
  const swaps = [];
  const arrayed = async (had, targets) => {
    for (const m of (await d.adopt(had, targets)).matched) if (m.part !== m.target.part) swaps.push(m);
  };
  /** Drops the first piece of a row (always the plain fence) and arrays the rest from it. */
  const fenceRow = async (row, alongZ, cues) => {
    await d.pick(H("fence"), { ring: cues ? true : false });
    if (alongZ) {
      await d.move({ world: row[0].position }, 0.6);
      if (cues) await d.cue(cues[0]);
      await d.key("Shift+BracketRight", { show: ["Shift", "]"], seconds: 1.6, after: 0.5 });
    }
    const first = await d.place(row[0], { seconds: 0.6, after: 0.3 });
    if (row[0].part !== H("fence")) swaps.push({ id: first, part: H("fence"), target: row[0] });
    if (cues) await d.cue(cues[1]);
    await d.reveal({ field: "Copies" }, 0.5);
    await d.field("Copies", row.length);
    if (alongZ) {
      await d.field("Step X", 0);
      await d.field("Step Z", 4);
    }
    const had = new Set(await d.call("ids"));
    await d.press({ sel: "button", text: `Make ${row.length} in a row` }, { ring: true, after: 0.4 });
    await arrayed(had, row.slice(1));
  };

  await d.say("fence-1");
  d.chapter("STEP 3", "Fence it in");
  await d.camera(CAM.top, 1.6);
  await d.cue(0.22);
  await gridStep(d, "2 m");
  await d.cue(0.42);
  await fenceRow(backRow, false, [0, 0.7]);

  await d.say("fence-2");
  await fenceRow(leftRow, true, [0.38, 0.72]);

  await d.say("fence-3");
  d.timelapse("Time-lapse");
  await d.stamp([...rightRow, ...frontRow], { each: 0.16 });
  d.timelapse(null);
  await d.cue(0.7);
  await d.pick(H("arch_gate"), { ring: true });
  await d.place(gate, { seconds: 0.7, after: 0.5 });
  await d.key("Escape", { after: 0.1 });

  await d.say("fence-4");
  {
    const plain = pillars.filter(is(H("fence_pillar"))).sort((a, b) => a.position[2] - b.position[2] || a.position[0] - b.position[0]);
    await d.pick(H("fence_pillar"), { ring: true });
    await d.cue(0.4);
    d.showKeys(["Shift", "~+ click"], 2.6);
    for (const p of plain.slice(0, 3)) await d.place(p, { shift: true, seconds: 0.5, after: 0.1 });
    d.timelapse("Time-lapse");
    await d.stamp([...plain.slice(3), ...pillars.filter(is(H("fence_pillar_broken")))], { each: 0.13 });
    d.timelapse(null);
  }

  await d.say("fence-5");
  for (const s of swaps) {
    await d.move({ world: [s.target.position[0], 1, s.target.position[2]] }, 0.4);
    await d.click();
    d.showKeys(["Del"], 0.7);
    d.event("key");
    await d.dispatch({ type: "remove", ids: [s.id] });
    await d.wait(0.2);
  }
  await d.stamp(swaps.map((s) => s.target), { each: 0.35 });

  // --- Step 4: path and crypt -----------------------------------------------------------------------
  const path = take((i) => /path_[A-D]$/.test(i.part ?? "")).sort((a, b) => b.position[2] - a.position[2]);
  const [crypt] = take(is(H("crypt")));
  const doorCandles = take(is(H("skull_candle"), H("candle_triple")));

  await d.say("path-1");
  d.chapter("STEP 4", "Path and crypt");
  await d.camera(CAM.path, 1.8);
  await d.cue(0.12);
  await gridStep(d, "0.5 m");
  await d.cue(0.4);
  await d.stamp(path.slice(0, 2), { each: 0.6, inOrder: true, escape: false });
  d.timelapse("Time-lapse");
  await d.stamp(path.slice(2), { each: 0.22, inOrder: true });
  d.timelapse(null);

  await d.say("crypt-1");
  await d.press({ sel: 'input[aria-label="Search parts"]', fx: 0.4 }, { ring: true });
  await d.cue(0.3);
  await d.type("crypt", 8);
  await d.wait(0.4);
  await d.pick(H("crypt"), { ring: true });
  await d.place(crypt, { seconds: 0.9, after: 0.6 });
  await d.press({ sel: 'button[aria-label="Clear search"]' }, { seconds: 0.5 });
  await d.cue(0.72);
  await d.stamp(doorCandles, { each: 0.4 });

  // --- Step 5: graves -------------------------------------------------------------------------------
  const graves = take((i) => /-(grave_A|grave_B|gravestone|gravemarker_A|gravemarker_B|grave_A_destroyed)$/.test(i.part ?? ""));
  const coffins = [...take(is(H("coffin_decorated"))), ...take(is(H("coffin")))];
  const seats = take(is(H("bench_decorated"), H("shrine_candles"), H("plaque_candles")));

  await d.say("graves-1");
  d.chapter("STEP 5", "Dig the graves");
  await d.camera(CAM.graves, 1.8);
  await d.cue(0.3);
  {
    // The first kind slowly, the rest as a time-lapse.
    const kinds = [...new Set(graves.map((g) => g.part))];
    const first = graves.filter((g) => g.part === kinds[0]);
    await d.pick(kinds[0], { ring: true });
    d.showKeys(["Shift", "~+ click"], 2.4);
    for (const g of first) await d.place(g, { shift: true, seconds: 0.45, after: 0.1 });
    await d.cue(0.62);
    d.timelapse("Time-lapse");
    await d.stamp(graves.filter((g) => g.part !== kinds[0]), { each: 0.2 });
    d.timelapse(null);
  }

  await d.say("graves-2");
  await d.camera(CAM.yard, 1.6);
  await d.stamp([...coffins, ...seats], { each: 0.55, inOrder: true, switching: 0.4 });

  // --- Step 6: skeletons ----------------------------------------------------------------------------
  const skeletons = take((i) => (i.part ?? "").startsWith("character-pack-skeletons-"));
  const warrior = skeletons.find(is(SK("Skeleton_Warrior")));
  const digger = skeletons.find((i) => i.animation === "Skeletons_Awaken_Floor_Long");
  const crew = skeletons.filter((i) => i !== warrior && i !== digger);

  await d.say("skel-1");
  d.chapter("STEP 6", "Bring in the skeletons");
  await d.camera(CAM.warrior, 1.8);
  await d.cue(0.35);
  await kit(d, "Skeletons");
  await d.pick(SK("Skeleton_Warrior"), { ring: true });
  const warriorId = await d.place(warrior, { seconds: 0.8, after: 0.5, keep: ["rotation", "animation"] });

  await d.say("skel-2");
  await d.poll(`!!document.querySelector('button[aria-label^="Animation:"]')`);
  await d.cue(0.28);
  await d.dropdown("Animation", "Idle Combat", { search: "idle c" });
  if ((await current()).find((i) => i.id === warriorId)?.animation !== "Idle_Combat") await d.dispatch({ type: "update", id: warriorId, patch: { animation: "Idle_Combat" } });

  await d.say("skel-3");
  await d.move({ world: [warrior.position[0] + 2.2, 1.4, warrior.position[2]] }, 0.5);
  await d.cue(0.3);
  await d.key("BracketRight", { show: ["]"], after: 0.6 });
  await d.key("BracketRight", { show: ["]"], after: 0.1 });
  await d.dispatch({ type: "update", id: warriorId, patch: { rotation: warrior.rotation } });
  await d.spoken(0.3);

  await d.say("skel-4");
  await d.key("Escape", { after: 0.1 });
  await d.camera(CAM.crew, 1.6);
  await d.stamp(crew, { each: 0.6, inOrder: true, switching: 0.4 });
  await d.cue(0.42);
  await d.camera(CAM.digger, 1.5);
  await d.pick(SK("Skeleton_Minion"), { ring: true });
  const diggerId = await d.place(digger, { seconds: 0.7, after: 0.4, keep: ["animation"] });
  await d.poll(`!!document.querySelector('button[aria-label^="Animation:"]')`);
  await d.dropdown("Animation", "Skeletons Awaken Floor Long", { search: "floor long" });
  if ((await current()).find((i) => i.id === diggerId)?.animation !== digger.animation) await d.dispatch({ type: "update", id: diggerId, patch: { animation: digger.animation } });
  await d.key("Escape", { after: 0.1 });
  await d.move({ x: centre.x + 260, y: centre.y + 240 }, 0.6);
  await d.spoken(1.6);

  // --- Step 7: trees and clutter --------------------------------------------------------------------
  // (What the lights step places is set aside first: the two jack-o'-lanterns by the gate glow.)
  const lights = take((i) => i.kind === "light");
  const gateLeft = lights.find((i) => /left/.test(i.name));
  const lanterns = take(is(H("post_lantern"))).sort((a, b) => a.position[0] - b.position[0]);
  const glowing = [...take(is(H("lantern_standing"))), ...take(is(H("post_skull"))), ...take((i) => /jackolantern$/.test(i.part ?? "") && i.position[2] > 11.5)];
  const deadTrees = take((i) => /tree_dead/.test(i.part ?? ""));
  const pines = take((i) => /tree_pine/.test(i.part ?? ""));
  const pumpkins = take((i) => /pumpkin/.test(i.part ?? ""));
  const clutter = take(is(H("bone_A"), H("bone_B"), H("bone_C"), H("skull"), H("ribcage"), H("candle"), H("candle_melted"), H("candle_thin")));

  await d.say("trees-1");
  d.chapter("STEP 7", "Trees and clutter");
  await d.camera(CAM.wide, 1.8);
  await d.cue(0.16);
  await kit(d, "Halloween");
  await d.cue(0.3);
  await d.stamp(deadTrees, { each: 0.4 });
  await d.cue(0.56);
  {
    // One pine dropped at the kit's size, grown with "+", then the rest.
    const [pine, ...others] = pines;
    await d.pick(pine.part, { ring: true });
    const id = await d.place(pine, { seconds: 0.6, after: 0.3, keep: ["scale"] });
    await d.cue(0.76);
    await d.key("+", { show: ["+"], after: 0.4 });
    await d.dispatch({ type: "update", id, patch: { scale: pine.scale } });
    await d.wait(0.4);
    d.timelapse("Time-lapse");
    await d.stamp(others, { each: 0.22 });
    d.timelapse(null);
  }

  await d.say("scatter-1");
  await d.camera(CAM.yard, 1.6);
  {
    // The pumpkin there are most of: one by hand, the others with Scatter.
    const counts = new Map();
    for (const p of pumpkins) counts.set(p.part, (counts.get(p.part) ?? 0) + 1);
    const most = [...counts].sort((a, b) => b[1] - a[1])[0][0];
    const [one, ...copies] = pumpkins.filter((p) => p.part === most);
    await d.pick(most, { ring: true });
    await d.place(one, { seconds: 0.7, after: 0.3 });
    await d.cue(0.3);
    await d.reveal({ field: "N" }, 0.6);
    await d.field("N", copies.length);
    await d.field("R", 12);
    const had = new Set(await d.call("ids"));
    await d.press({ sel: "button", text: `Scatter ${copies.length} around it` }, { ring: true, after: 0.2 });
    // The builder scatters at random; the copies take the finished scene's spots.
    const random = (await current()).filter((i) => !had.has(i.id)).map((i) => i.id);
    if (random.length) await d.dispatch({ type: "remove", ids: random });
    await d.dispatch({ type: "add", items: copies.map((c, n) => ({ ...c, id: `scatter${n}` })) });
    await d.loaded(copies.map((_, n) => `scatter${n}`));
    await d.wait(0.8);
    await d.cue(0.78);
    d.timelapse("Time-lapse");
    await d.stamp([...pumpkins.filter((p) => p.part !== most), ...clutter], { each: 0.16 });
    d.timelapse(null);
  }

  // --- Step 8: night, and lights --------------------------------------------------------------------
  await d.say("night-1");
  d.chapter("STEP 8", "Light it up");
  await d.key("Escape", { after: 0.1 });
  await d.camera(CAM.hero, 1.8);
  await d.move({ x: centre.x, y: centre.y + 120 }, 0.5);
  await d.cue(0.3);
  await d.key("3", { show: ["3"], seconds: 1.6, after: 0.3 });
  if ((await d.doc()).environment !== "night") await d.dispatch({ type: "scene", patch: { environment: "night" } });
  d.highlight({ sel: "aside [role=radio]", text: "Night" }, 2);
  await d.orbit(-0.2, 3);

  await d.say("light-1");
  await d.camera(CAM.gate, 1.6);
  await d.pick(H("post_lantern"), { ring: true });
  await d.place(lanterns[0], { shift: true, seconds: 0.7, after: 0.3 });
  await d.place(lanterns[1], { shift: true, seconds: 0.6, after: 0.3 });
  await d.key("Escape", { after: 0.1 });

  await d.say("light-2");
  await d.cue(0.42);
  await d.pick("light", { ring: 1.8 });
  await d.cue(0.75);
  // Dropped on the floor by the lantern: it lands 1.2 m up; the next line raises it to the lamp.
  const lightId = await d.place({ ...gateLeft, position: [gateLeft.position[0], 1.2, gateLeft.position[2]] }, { seconds: 0.7, after: 0.4 });

  await d.say("light-3");
  await d.cue(0.12);
  await d.field("Y", gateLeft.position[1]);
  await d.dispatch({ type: "update", id: lightId, patch: { position: gateLeft.position } });
  await d.cue(0.42);
  for (const [target, until] of [[{ sel: "label", text: "Color" }, 0.52], [{ field: "Power" }, 0.6], [{ field: "Range" }, 0.7]]) {
    d.highlight(target, 1.1);
    await d.move(target, 0.35);
    await d.cue(until);
  }
  d.highlight({ sel: "label", text: "Flame flicker" }, 2.2);
  await d.move({ sel: "label", text: "Flame flicker", fx: 0.08, fy: 0.3 }, 0.4);

  await d.say("light-4");
  await d.key("Escape", { after: 0.1 });
  await d.camera(CAM.yard, 1.8);
  d.timelapse("Time-lapse");
  await d.stamp([...glowing, ...lights.filter((i) => i !== gateLeft), ...all.filter((i) => !used.has(i))], { each: 0.3 });
  d.timelapse(null);
  {
    // The scene must now be the one the tutorial opened with.
    const made = await current();
    const missing = all.filter((t) => !made.some((i) => (i.part ?? i.kind) === (t.part ?? t.kind) && at(i, t.position[0], t.position[2], 0.05)));
    console.log(`  built ${made.length} of ${all.length} objects (${made.filter((i) => i.kind === "light").length} lights)${missing.length ? ` — missing: ${missing.map((m) => m.name).join(", ")}` : ""}`);
  }
  await d.orbit(-0.3, 2.4);

  // --- Step 9: look around, export ------------------------------------------------------------------
  await d.say("end-1");
  d.chapter("STEP 9", "Look around and export");
  await d.cue(0.3);
  await d.press({ sel: 'button[aria-label="Hide panel"]' }, { ring: true, after: 0.2 });
  await d.press({ sel: 'button[aria-label="Hide inspector"]' }, { ring: true, after: 0.2 });
  const wide = await d.call("view");
  const middle = { x: wide.l + wide.w / 2, y: wide.t + wide.h / 2 };
  await d.move(middle, 0.6);
  await d.cue(0.72);
  await d.key("Shift+f", { show: ["Shift", "F"], after: 0.5 });
  await d.camera(CAM.hero, 2);

  await d.say("end-2");
  await d.move({ x: middle.x + 120, y: middle.y + 60 }, 0.4);
  await d.drag([-260, -24], 1.5);
  await d.cue(0.42);
  d.showKeys(["~right-drag"], 1.2);
  await d.drag([90, 34], 1.1, "right");
  await d.cue(0.76);
  await d.wheel(-420, 1.2);
  await d.wait(0.8);

  await d.say("end-3");
  await d.press({ sel: 'button[title^="Export"]' }, { ring: true, after: 0.5 });
  await d.cue(0.2);
  d.highlight({ sel: "[role=dialog] button", text: "3D scene (.glb)" }, 5, 3);
  await d.move({ sel: "[role=dialog] button", text: "3D scene (.glb)", fx: 0.7 }, 0.5);
  await d.cue(0.76);
  d.highlight({ sel: "[role=dialog] button", text: "Scene pack (.zip)" }, 3, 3);
  await d.move({ sel: "[role=dialog] button", text: "Scene pack (.zip)", fx: 0.7 }, 0.4);
  await d.spoken(0.4);
  await d.press({ sel: '[role=dialog] button[aria-label="Close"]' }, { seconds: 0.5 });

  await d.say("end-4");
  await d.press({ sel: 'button[aria-label="New project"]' }, { ring: true, after: 0.4 });
  await d.cue(0.3);
  d.highlight({ sel: "[role=dialog] label", text: "Haunted backyard" }, 3, 2);
  await d.move({ sel: "[role=dialog] label", text: "Haunted backyard", fx: 0.6 }, 0.5);
  await d.cue(0.72);
  await d.press({ sel: "[role=dialog] button", text: "Cancel" }, { seconds: 0.5 });
  d.hideChip();
  d.shown = false;
  await d.camera({ position: [-13, 12, 30], target: CAM.hero.target }, 2.6);
  d.titleCard({ eyebrow: "Your turn", title: "Now build your own", sub: "Free, in your browser — over 6,700 parts to play with", foot: "models.codelove.in/builder" }, 5.2, { fadeIn: 0.9, fadeOut: 0.01, dim: 0.8 });
  await d.orbit(-0.3, 5.2);
}
