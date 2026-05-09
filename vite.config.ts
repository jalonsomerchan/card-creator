import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// GitHub Pages serves project sites from /<repo-name>/.
// Keep local development at / so Vite HMR and dev URLs remain simple.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/card-creator/' : '/',
  plugins: [svelte()],
}))
