import './style.css'
import { webgpu } from './webgpu.ts'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <canvas id="canvasElement" width="1024" height="1024"></canvas>
`

const canvas = document.getElementById("canvasElement") as HTMLCanvasElement | null;
if (canvas === null) {
    throw new Error("Could not find canvas element");
}

const gpu = new webgpu(canvas)
await gpu.init()