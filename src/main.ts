import { mount } from 'svelte'
import './app.css'
import './inline-editor.css'
import './fixed-editor.css'
import './unified-card.css'
import App from './AppUnified.svelte'

const app = mount(App, {
  target: document.getElementById('app')!,
})

export default app
