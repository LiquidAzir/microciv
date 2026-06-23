// MicroCiv runtime config — a plain <script>, loaded before cloud.js + app.js.
//
// AUTOMATIC CLOUD SAVE SYNC (optional)
// -----------------------------------
// cloudUrl points at a tiny Cloudflare Worker + KV key/value store (see /worker).
// When set, your game uploads after each turn and any device that opens your
// personal ?u=<id> link (or scans the QR on the Cloud Sync screen) shares one
// save automatically — pull on launch, push on save, last-write-wins.
//
// Points at this game's own dedicated worker (deployed from /worker, backed by a
// fresh KV namespace). MicroCiv's saves use `mc…` device ids.
// To use a different worker, deploy /worker (see worker/README.md) and paste its
// URL here. Leave cloudUrl as '' to keep saves local-only (Export/Import still work).
window.MICROCIV_CONFIG = {
  cloudUrl: 'https://microciv-saves.liquidazir.workers.dev'
};
