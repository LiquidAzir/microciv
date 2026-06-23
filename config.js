// MicroCiv runtime config — a plain <script>, loaded before cloud.js + app.js.
//
// AUTOMATIC CLOUD SAVE SYNC (optional)
// -----------------------------------
// cloudUrl points at a tiny Cloudflare Worker + KV key/value store (see /worker).
// When set, your game uploads after each turn and any device that opens your
// personal ?u=<id> link (or scans the QR on the Cloud Sync screen) shares one
// save automatically — pull on launch, push on save, last-write-wins.
//
// By default this reuses the shared `glassrealm-saves` worker. MicroCiv's saves
// live under their own `mc…` device id, so they never collide with other games.
// To run your own dedicated worker instead, deploy /worker (see worker/README.md)
// and paste its URL here, e.g. 'https://microciv-saves.<you>.workers.dev'.
//
// Leave cloudUrl as '' to keep saves local-only (Export/Import codes still work).
window.MICROCIV_CONFIG = {
  cloudUrl: 'https://glassrealm-saves.liquidazir.workers.dev'
};
