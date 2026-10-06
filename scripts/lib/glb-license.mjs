import fs from "node:fs";

const JSON_CHUNK = 0x4e4f534a;

/**
 * Embeds the license in a .glb's `asset` block (copyright + `extras.license*`), so a single
 * downloaded file still carries its license notice. Replaces any previous `asset.extras`. With
 * `scrub`, matching text is also removed from node / mesh / material / texture names. Rewrites only
 * the JSON chunk; the binary chunk (geometry, textures) is copied byte-for-byte.
 */
export function stampLicense(file, { copyright, license, licenseText, scrub }) {
  const glb = fs.readFileSync(file);
  if (glb.readUInt32LE(0) !== 0x46546c67) throw new Error(`${file}: not a GLB`);
  const jsonLength = glb.readUInt32LE(12);
  if (glb.readUInt32LE(16) !== JSON_CHUNK) throw new Error(`${file}: first chunk is not JSON`);

  const json = JSON.parse(glb.subarray(20, 20 + jsonLength).toString("utf8"));
  json.asset = { ...json.asset, copyright, extras: { license, licenseText } };
  if (scrub) {
    for (const list of Object.values(json)) {
      if (!Array.isArray(list)) continue;
      for (const item of list) if (typeof item?.name === "string") item.name = item.name.replace(scrub, "") || item.name;
    }
  }

  let text = Buffer.from(JSON.stringify(json), "utf8");
  const pad = (4 - (text.length % 4)) % 4;
  if (pad) text = Buffer.concat([text, Buffer.alloc(pad, 0x20)]);

  const rest = glb.subarray(20 + jsonLength); // remaining chunks (BIN), already 4-byte aligned
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(20 + text.length + rest.length, 8);
  header.writeUInt32LE(text.length, 12);
  header.writeUInt32LE(JSON_CHUNK, 16);
  fs.writeFileSync(file, Buffer.concat([header, text, rest]));
}
