import { copyFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'
import { svelte } from '@sveltejs/vite-plugin-svelte'

/**
 * GitHub Pages serves static files only, so `GET /log` is a hard 404 without a shim.
 *
 * The shim must be **copied from the build output**, never hand-written into `public/`: Vite
 * hashes asset filenames, so a static copy would point at a stale bundle after the next build
 * and fail only in production, only on deep links.
 *
 * Pages returns HTTP 404 alongside this file's contents. The app renders correctly; only
 * crawlers and `curl -f` see the status. Accepted — see the spec.
 */
function pagesSpaFallback(): Plugin {
  let root = process.cwd()
  let outDir = 'dist'
  return {
    name: 'pages-spa-fallback',
    apply: 'build',
    configResolved(config) {
      root = config.root
      outDir = config.build.outDir
    },
    closeBundle() {
      const dir = resolve(root, outDir)
      const index = resolve(dir, 'index.html')
      if (!existsSync(index)) {
        throw new Error('dist/index.html is missing — cannot write the 404 shim')
      }
      copyFileSync(index, resolve(dir, '404.html'))
    },
  }
}

export default defineConfig({
  // Apex-style custom domain (golf.whitfield.life), not a project subpath.
  base: '/',
  plugins: [svelte(), pagesSpaFallback()],
  test: {
    // `infra/` is plain ESM, not TypeScript, and sits outside `tsconfig.json`'s `include` — the
    // Lambda deploys as a single file with no build step, so there is nothing to type-check.
    // Tests are therefore the only gate on it, which is why it is listed here explicitly.
    include: ['src/**/*.test.ts', 'infra/**/*.test.mjs'],
  },
})
