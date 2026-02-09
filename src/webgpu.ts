export class webgpu {
    public async init() {
        if (!navigator.gpu) {
            throw new Error("WebGPU not supported on this browser.");
        }

        const adapter = await navigator.gpu?.requestAdapter();
        if (!adapter) {
            throw new Error("No appropriate GPUAdapter found.");
        }

        console.log('Adapter limits:', adapter.limits)
        console.log('Adapter features:', adapter.features)

        const canvas = document.getElementById("canvasElement") as HTMLCanvasElement | null;
        if (canvas === null) {
            throw new Error("Could not find canvas element");
        }

        const device = await adapter.requestDevice();

        const context = canvas.getContext("webgpu") as GPUCanvasContext | null;
        if (context === null) {
            throw new Error("Could not find context element");
        }

        const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
        context.configure({
            device: device,
            format: canvasFormat,
        });

        // Clear the canvas with a render pass
        const encoder = device.createCommandEncoder();

        const pass = encoder.beginRenderPass({
            colorAttachments: [{
                view: context.getCurrentTexture().createView(),
                loadOp: "clear",
                storeOp: "store",
                clearValue: { r: 0.2, g: 0.2, b: 0.2, a: 1.0 },
            }]
        });

        pass.end();

        //const commandBuffer = encoder.finish();
        //device.queue.submit([commandBuffer]);

        // Finish the command buffer and immediately submit it.
        device.queue.submit([encoder.finish()]);

        console.log("Hello World!")
    }
}