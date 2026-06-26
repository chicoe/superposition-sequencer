import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    // Static single-page app: the sequencer is fully client-rendered and talks
    // to the backend over /api at runtime, so there's nothing to SSR. The
    // `fallback` page is the SPA shell every route resolves to. Output lands in
    // `build/`, which Firebase Hosting serves directly.
    adapter: adapter({ fallback: 'index.html' })
  }
};

export default config;
