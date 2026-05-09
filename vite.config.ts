import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// Use relative assets so the app works both with a custom GitHub Pages domain
// like https://cardcreator.alon.one/ and with project URLs like /card-creator/.
export default defineConfig({
  base: './',
  plugins: [svelte()],
})
