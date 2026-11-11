// Written into the page by Vite at build time (web/vite.config.ts, from web/studio-licence.ts): what AG's licence
// manager made of VITE_AG_STUDIO_LICENSE, with no key material. core's `studioAllowed` reads it (044 §2).
declare const __AG_STUDIO_LICENCE__: import("@goose/core/studio-gate").StudioLicenceFacts;
declare const __STUDIO_BY_DEFAULT__: boolean;
/** The moment Studio stops being the page's default (`studioUntil`), in ms; 0 with no good licence. */
declare const __STUDIO_UNTIL__: number;
