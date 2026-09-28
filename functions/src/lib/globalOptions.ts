import { setGlobalOptions } from "firebase-functions/v2";
import { region } from "./runtimeOptions";

/**
 * Establishes the default region for every v2 function as a safety net.
 *
 * Every function in this codebase already declares `{ region, ... }`
 * explicitly (see `lib/runtimeOptions.ts`'s shared `region` export), so this
 * global default never actually changes what gets deployed for an existing
 * function — it only kicks in for a function that omits `region` entirely,
 * and it keeps the same "europe-west1" value so nothing about existing
 * functions moves or gets recreated.
 *
 * IMPORTANT: `setGlobalOptions` must run before any `onCall`/`onRequest`/etc.
 * function is *defined* (not just before it executes), because those calls
 * read the global options synchronously at module-load time. This file must
 * therefore be the very first thing imported by `index.ts`, ahead of the
 * `export * from "./<module>"` statements that pull in every function
 * definition — see the comment at the top of `index.ts`.
 */
setGlobalOptions({ region });
