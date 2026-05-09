import { mount } from 'svelte'
import './app.css'
import './inline-editor.css'
import './fixed-editor.css'
import App from './AppFixed.svelte'

const app = mount(App, {
  target: document.getElementById('app')!,
})

export default app
