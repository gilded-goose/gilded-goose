// Snap a photo (item 12): the camera's picture, made small in the page before it's sent (1024 px on its long side, a
// JPEG of about 0.2 MB), so one vision call reads it and nothing large crosses the network. Held in memory only: never
// put in storage, a cookie or the URL.

import type { Photo } from "@goose/core/photo";

const LONG_SIDE = 1024;

/** The picked file as the route's JSON, or null when the browser can't read it as an image. */
export async function photoData(file: File): Promise<Photo | null> {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return null;
  const k = Math.min(1, LONG_SIDE / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bmp.width * k));
  canvas.height = Math.max(1, Math.round(bmp.height * k));
  const g = canvas.getContext("2d");
  if (!g) { bmp.close(); return null; }
  g.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  const url = canvas.toDataURL("image/jpeg", 0.8);
  return { mediaType: "image/jpeg", data: url.slice(url.indexOf(",") + 1) };
}
