import { defineConfig } from 'vitest/config'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  // Apex-style custom domain (golf.whitfield.life), not a project subpath.
  base: '/',
  plugins: [svelte()],
  test: {
    include: ['src/**/*.test.ts'],
  },
})
