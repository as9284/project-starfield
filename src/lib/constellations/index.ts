/**
 * Central registry of every constellation handler.
 *
 * To give Luna control over a new constellation:
 *  1. Create a handler file in this directory (see existing ones for examples).
 *  2. Import it here and add it to the `handlers` array.
 *
 * That's it — Luna's system prompt, command parsing, execution, and card
 * rendering will automatically pick it up. No changes to Luna.tsx needed.
 */

import type { ConstellationHandler } from "../constellation-registry";
import { orbitHandler } from "./orbit";
import { solarisHandler } from "./solaris";
import { hyperlaneHandler } from "./hyperlane";
import { pulsarHandler } from "./pulsar";
import { lyraHandler } from "./lyra";
import { navigateHandler } from "./navigate";

export const constellationHandlers: readonly ConstellationHandler[] = [
  navigateHandler,
  orbitHandler,
  solarisHandler,
  hyperlaneHandler,
  pulsarHandler,
  lyraHandler,
];

// Re-export the navigation fallback for Luna's input handling
export { inferNavigationTarget } from "./navigate";
