import cellShader from './shaders/cell.wgsl?raw'

export class webgpu {
    private canvas: HTMLCanvasElement;

    private device!: GPUDevice
    private encoder!: GPUCommandEncoder
    private context!: GPUCanvasContext
    private canvasFormat!: GPUTextureFormat

    private shader!: GPUShaderModule
    private pipeline!: GPURenderPipeline
    
    private vertices: Float32Array | undefined
    private buffer: GPUBuffer | undefined

    private gridSize = 128
    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
    }

    public async init() {
        await this.initDevice()
        this.initCanvas()
        this.vertices = new Float32Array([
            // X,    Y,
            -0.8, -0.8, // Triangle 1 (Blue)
            0.8, -0.8,
            0.8,  0.8,

            -0.8, -0.8, // Triangle 2 (Red)
            0.8,  0.8,
            -0.8,  0.8,
        ]);

        this.buffer = this.device.createBuffer({
            label: "Cell vertices",
            size: this.vertices.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        })
        
        this.device.queue.writeBuffer(this.buffer, 0, this.vertices);

        const vertexBufferLayout: GPUVertexBufferLayout[] = [
            {
                arrayStride: 8, // bytes to skip forward in buffer to find next vertex
                attributes: [{
                    format: "float32x2",
                    offset: 0,
                    shaderLocation: 0, // @location(0) in @vertex shader.
                }],
            }
        ]

        this.shader = this.device.createShaderModule({
            label: "Cell shader",
            code: cellShader,
        });

        this.pipeline = this.device.createRenderPipeline({
            label: "Cell pipeline",
            layout: "auto",
            vertex: {
            module: this.shader,
            entryPoint: "vertexMain",
            buffers: vertexBufferLayout
            },
            fragment: {
                module: this.shader,
                entryPoint: "fragmentMain",
                targets: [{
                    format: this.canvasFormat
                }]
            }
        });

        // Create a uniform buffer that describes the grid.
        const uniformArray = new Float32Array([this.gridSize, this.gridSize]);
        const uniformBuffer = this.device.createBuffer({
            label: "Grid Uniforms",
            size: uniformArray.byteLength,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        this.device.queue.writeBuffer(uniformBuffer, 0, uniformArray);

        // Create a bind group to pass the grid uniforms into the pipeline
        const bindGroup = this.device.createBindGroup({
            label: "Cell bind group",
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [{
            binding: 0,
            resource: { buffer: uniformBuffer }
            }],
        });

        // Clear the canvas with a render pass
        const encoder = this.device.createCommandEncoder() as GPUCommandEncoder | null;
        if (encoder === null) {
            throw new Error("Could not find encoder");
        }

        this.encoder = encoder

        const pass = this.encoder.beginRenderPass({
            colorAttachments: [{
                view: this.context.getCurrentTexture().createView(),
                loadOp: "clear",
                clearValue: { r: 0.2, g: 0.2, b: 0.2, a: 1.0 },
                storeOp: "store",
            }]
        });

        // Draw the square.
        pass.setPipeline(this.pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.setVertexBuffer(0, this.buffer);

        const instanceCount = this.gridSize * this.gridSize;
        pass.draw(this.vertices.length / 2, instanceCount);

        pass.end();

        // Finish the command buffer and immediately submit it.
        this.device.queue.submit([encoder.finish()])

        console.log("Hello World!")
    }

    public async initDevice() {
        if (!navigator.gpu) {
            throw new Error("WebGPU not supported on this browser.");
        }

        const adapter = await navigator.gpu?.requestAdapter() as GPUAdapter | null;
        if (adapter === null) {
            throw new Error("No appropriate GPUAdapter found.");
        }

        console.log('Adapter limits:', adapter.limits)
        console.log('Adapter features:', adapter.features)

        const device = await adapter.requestDevice() as GPUDevice | null;
        if (device === null) {
            throw new Error("Could not find device");
        }

        this.device = device
    }

    public async initCanvas() {
        const context = this.canvas.getContext("webgpu") as GPUCanvasContext | null;
        if (context === null) {
            throw new Error("Could not find context element");
        }

        this.context = context

        const canvasFormat = navigator.gpu.getPreferredCanvasFormat() as GPUTextureFormat | n;
        context.configure({
            device: this.device,
            format: canvasFormat,
        });

        this.canvasFormat = canvasFormat
    }
}

