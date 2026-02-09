import './style.css'
import { webgpu } from './webgpu.ts'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <canvas id="canvasElement" width="512" height="512"></canvas>
`
const gpu = new webgpu()
await gpu.init()