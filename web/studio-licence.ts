// The AG Studio licence, read at build time (Track AS, 044 §2). Vite asks AG's own licence manager what it makes of
// `VITE_AG_STUDIO_LICENSE` and writes only the facts (valid, expiry, expired, trial) into the page as a constant, so
// the browser decides the Studio-or-Community question (core/src/view/studio-gate.ts) without loading AG Studio's chunk
// to ask. The key itself reaches the bundle separately, through import.meta.env, as AG intends; it is never printed.
//
// `getLicenseDetails` is marked @internal by AG, so this file is also its contract test: on every build it checks the
// answer for an empty key is exactly "missing, not valid" and throws otherwise, so an `ag-studio` upgrade that changes
// the shape fails the build (and `pnpm check`) instead of silently waving an unknown licence through or shutting Studio.

import { AgStudioLicenseManager } from "ag-studio";
import { NO_LICENCE, type StudioLicenceFacts } from "../core/src/view/studio-gate.ts";

export function studioLicenceFacts(key: string | undefined): StudioLicenceFacts {
  const probe = AgStudioLicenseManager.getLicenseDetails("", new Set());
  if (!probe || probe.valid !== false || probe.missing !== true) {
    throw new Error("ag-studio's licence manager changed shape (getLicenseDetails is @internal): the studio gate can't read it. Pin ag-studio 3.0.0 or update web/studio-licence.ts and core/src/view/studio-gate.ts.");
  }
  if (!key) return NO_LICENCE;
  const d = AgStudioLicenseManager.getLicenseDetails(key, new Set());
  if (d.valid !== true) return { valid: false, missing: false, expiry: null, expired: null, isTrial: null };
  return { valid: true, missing: false, expiry: d.expiry ?? null, expired: d.expired ?? null, isTrial: d.isTrial ?? null };
}

