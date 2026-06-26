// Render entirely on the client. The app is an interactive SPA that fetches
// quantum state from /api at runtime (Threlte/WebGL + Tone.js are browser-only),
// so there's nothing to server-render or prerender — adapter-static emits the
// `fallback` shell and the app boots in the browser.
export const ssr = false;
export const prerender = false;
