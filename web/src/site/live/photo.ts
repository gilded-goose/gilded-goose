// The camera's reading, for the site's Ask boxes. One vision call on the server (the Desk's /api/runs/photo); with no live
// AI, or the server away, it says so in plain words and typing still works. Never invents a reading: the words are the
// route's own chips, kept only when they end "under your limit".
import type { PhotoAnswer } from "@goose/core/photo";
import { postJson } from "./api.ts";

const UNDER = /,? under your limit\.?$/i;
const READ_MS = 30_000;

export type PhotoReading = { words: string } | { note: string };

export async function readPhoto(file: File): Promise<PhotoReading> {
  const photo = await import("../../snap.ts").then((m) => m.photoData(file)).catch(() => null);
  if (!photo) return { note: "That file couldn't be read as a photo. Try another, or type it." };
  const body = await postJson<PhotoAnswer & { error?: string }>("/api/runs/photo", photo, READ_MS);
  if (body === "away") return { note: "Goose couldn't reach the server, so the camera can't read a photo. Typing still works." };
  if (body.error) return { note: body.error };
  if (body.kind === "unavailable") return { note: body.say };
  if (body.miss || !UNDER.test(body.speak)) return { note: body.miss ?? body.speak };
  return { words: body.speak.replace(UNDER, "") };
}
