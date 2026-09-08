// Compatibility entrypoint kept for existing operational commands.
// P1-12 deliberately routes every V3.1 Final action through the immutable,
// source-locked, SEALED-session finalization path. Do not add a second gate here.
await import('./p1-12-finalize-v3.mjs');
