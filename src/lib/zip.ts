import { strToU8, Zip, ZipPassThrough } from "fflate";
import { asset } from "@/lib/asset";

export interface ZipFile {
  /** Public URL path of the file to fetch (basePath is added). */
  url: string;
  /** Path inside the archive. */
  path: string;
}

export interface ZipText {
  path: string;
  /** Text (line endings normalised to CRLF) or ready-made bytes, e.g. a generated .glb. */
  content: string | Uint8Array;
}

/**
 * Builds a .zip in the browser. Files are fetched with limited concurrency and streamed into the
 * archive without recompression (GLBs are already compressed), so memory stays close to the
 * archive size even for large packs.
 */
export async function buildZip(files: ZipFile[], texts: ZipText[], onProgress?: (done: number, total: number) => void): Promise<Blob> {
  const parts: Uint8Array[] = [];
  let finish!: (blob: Blob) => void;
  let fail!: (err: unknown) => void;
  const result = new Promise<Blob>((resolve, reject) => {
    finish = resolve;
    fail = reject;
  });
  const zip = new Zip((err, chunk, final) => {
    if (err) return fail(err);
    parts.push(chunk);
    if (final) finish(new Blob(parts as Uint8Array<ArrayBuffer>[], { type: "application/zip" }));
  });
  const add = (path: string, data: Uint8Array) => {
    const entry = new ZipPassThrough(path);
    zip.add(entry);
    entry.push(data, true);
  };

  for (const t of texts) add(t.path, typeof t.content === "string" ? strToU8(t.content.replace(/\r?\n/g, "\r\n")) : t.content);

  let next = 0;
  let done = 0;
  onProgress?.(0, files.length);
  const worker = async () => {
    while (next < files.length) {
      const file = files[next++];
      const res = await fetch(asset(file.url));
      if (!res.ok) throw new Error(`${file.url}: ${res.status}`);
      add(file.path, new Uint8Array(await res.arrayBuffer()));
      onProgress?.(++done, files.length);
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(4, files.length) }, worker));
  } catch (err) {
    zip.terminate();
    throw err;
  }
  zip.end();
  return result;
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
