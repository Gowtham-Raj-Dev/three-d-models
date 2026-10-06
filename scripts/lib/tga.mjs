/**
 * Minimal Truevision TGA decoder (types 2, 3, 10, 11 — truecolor / grayscale, raw or RLE).
 * Rocketbox ships every texture as TGA, which neither sharp nor FBX2glTF can read,
 * so we decode to raw pixels here and hand them to sharp.
 *
 * @param {Buffer} buf
 * @returns {{ width: number, height: number, channels: 1 | 3 | 4, data: Buffer }}
 */
export function decodeTGA(buf) {
  const idLength = buf[0];
  const colorMapType = buf[1];
  const imageType = buf[2];
  const colorMapLength = buf.readUInt16LE(5);
  const colorMapDepth = buf[7];
  const width = buf.readUInt16LE(12);
  const height = buf.readUInt16LE(14);
  const depth = buf[16];
  const descriptor = buf[17];

  if (![2, 3, 10, 11].includes(imageType)) {
    throw new Error(`Unsupported TGA image type ${imageType}`);
  }

  const gray = imageType === 3 || imageType === 11;
  const rle = imageType >= 9;
  const bpp = depth / 8;
  if (![1, 2, 3, 4].includes(bpp)) throw new Error(`Unsupported TGA depth ${depth}`);

  const channels = gray ? 1 : bpp === 4 ? 4 : 3;
  const topOrigin = (descriptor & 0x20) !== 0;
  const rightToLeft = (descriptor & 0x10) !== 0;
  const out = Buffer.alloc(width * height * channels);
  const total = width * height;

  let off = 18 + idLength + (colorMapType ? colorMapLength * Math.ceil(colorMapDepth / 8) : 0);

  const write = (i, so) => {
    const x = i % width;
    const y = (i / width) | 0;
    const dx = rightToLeft ? width - 1 - x : x;
    const dy = topOrigin ? y : height - 1 - y;
    const o = (dy * width + dx) * channels;
    if (gray) {
      out[o] = buf[so];
    } else if (bpp === 2) {
      const v = buf.readUInt16LE(so);
      out[o] = (((v >> 10) & 31) * 255) / 31;
      out[o + 1] = (((v >> 5) & 31) * 255) / 31;
      out[o + 2] = ((v & 31) * 255) / 31;
    } else {
      out[o] = buf[so + 2];
      out[o + 1] = buf[so + 1];
      out[o + 2] = buf[so];
      if (channels === 4) out[o + 3] = buf[so + 3];
    }
  };

  if (!rle) {
    for (let i = 0; i < total; i++, off += bpp) write(i, off);
  } else {
    let i = 0;
    while (i < total) {
      const header = buf[off++];
      const count = (header & 0x7f) + 1;
      if (header & 0x80) {
        for (let k = 0; k < count && i < total; k++) write(i++, off);
        off += bpp;
      } else {
        for (let k = 0; k < count && i < total; k++, off += bpp) write(i++, off);
      }
    }
  }

  return { width, height, channels, data: out };
}
