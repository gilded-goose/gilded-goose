// The Challenge's counter is real attempts only (Joshua, Nov 3), so a script that sends a round to a server stops here
// unless that server is on this machine. A flag or a header to skip the count would be a way to fake it, so there is none.

export function localOnly(url: string): string {
  const host = new URL(url).hostname;
  if (host !== "localhost" && host !== "127.0.0.1" && host !== "[::1]") {
    console.error(`this script sends rounds, and the live counter is real attempts only: run it against a local server, not ${host}`);
    process.exit(2);
  }
  return url;
}
