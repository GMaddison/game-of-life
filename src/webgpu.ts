import cellShader from './shaders/cell.wgsl?raw'
import cellComputeShader from './shaders/cell-compute.wgsl?raw';

const UPDATE_INTERVAL = 200; // ms

export class webgpu {
    private canvas: HTMLCanvasElement;

    private device!: GPUDevice
    private context!: GPUCanvasContext
    private canvasFormat!: GPUTextureFormat

    private shader!: GPUShaderModule
    private pipeline!: GPURenderPipeline
    
    private vertices!: Float32Array | undefined
    private buffer: GPUBuffer | undefined

    private step: number;

    private gridSize = 16
    private workgroupSize = 8;

    private simulationPipeline!: GPUComputePipeline;
    private bindGroups!: GPUBindGroup[];

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.step = 0;
    }

    public async init() {
        await this.initDevice()
        this.initCanvas()

        // VERTEX Stage
        this.vertices = new Float32Array([
            // X,    Y,
            // -1.0, -1.0, // Triangle 1 (Blue)
            // 1.0, -1.0,
            // 1.0,  1.0,

            // -1.0, -1.0, // Triangle 2 (Red)
            // 1.0,  1.0,
            // -1.0,  1.0,
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

        const vertexBufferLayout: GPUVertexBufferLayout = 
        {
            arrayStride: 8,
            attributes: [{
                format: "float32x2",
                offset: 0,
                shaderLocation: 0, // @location(0) in @vertex shader.
            }],
        };

        const bindGroupLayout = this.device.createBindGroupLayout({
            label: "Cell Bind Group Layout",
            entries: [{
                binding: 0,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT,
                buffer: {} // Grid uniform buffer
            }, {
                binding: 1,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE,
                buffer: { type: "read-only-storage" } // cell state input buffer
            }, {
                binding: 2,
                visibility: GPUShaderStage.COMPUTE,
                buffer: { type: "storage" } // Cell state output buffer
            }]
        });

        const pipelineLayout = this.device.createPipelineLayout({
            label: "Cell Pipeline Layout",
            bindGroupLayouts: [ bindGroupLayout ],
        });

        this.shader = this.device.createShaderModule({
            label: "Cell shader",
            code: cellShader,
        });

        this.pipeline = this.device.createRenderPipeline({
            label: "Cell pipeline",
            layout: pipelineLayout,
            vertex: {
                module: this.shader,
                entryPoint: "vertexMain",
                buffers: [vertexBufferLayout],
            },
            fragment: {
                module: this.shader,
                entryPoint: "fragmentMain",
                targets: [{
                    format: this.canvasFormat
                }]
            }
        });

        // TODO
        const computeshader = cellComputeShader.replace(/WORKGROUP_SIZE/g, String(this.workgroupSize));
        const simulationShaderModule = this.device.createShaderModule({
            label: "Life simulation shader",
            code: computeshader
        });

        this.simulationPipeline = this.device.createComputePipeline({
            label: "Simulation pipeline",
            layout: pipelineLayout,
            compute: {
                module: simulationShaderModule,
                entryPoint: "computeMain",
            },
        });

        // uniform buffer that describes the grid.
        const uniformArray = new Float32Array([this.gridSize, this.gridSize]);
        const uniformBuffer = this.device.createBuffer({
            label: "Grid Uniforms",
            size: uniformArray.byteLength,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        this.device.queue.writeBuffer(uniformBuffer, 0, uniformArray);

        // grid state
        const cellStateArray = new Uint32Array(this.gridSize * this.gridSize);
        const cellStateStorage = [
        this.device.createBuffer({
            label: "Cell State A",
            size: cellStateArray.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        }),
        this.device.createBuffer({
            label: "Cell State B",
            size: cellStateArray.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        }),
        ]

        // mark every third cell, first grid as active
        // for (let i = 0; i < cellStateArray.length; i += 3) {
        //         cellStateArray[i] = 1;
        // }

        for (let i = 0; i < cellStateArray.length; ++i) {
            cellStateArray[i] = Math.random() > 0.6 ? 1 : 0;
        }


        this.device.queue.writeBuffer(cellStateStorage[0], 0, cellStateArray);

        // mark every other cell, second grid as active
        for (let i = 0; i < cellStateArray.length; i++) {
                cellStateArray[i] = i % 2;
        }

        this.device.queue.writeBuffer(cellStateStorage[1], 0, cellStateArray);

        // bind group to pass the grid uniforms into the pipeline
        this.bindGroups = [
            this.device.createBindGroup({
            label: "Cell renderer bind group A",
            layout: bindGroupLayout,
            entries: [
            {
                binding: 0,
                resource: { buffer: uniformBuffer }
            },
            {
                binding: 1,
                resource: { buffer: cellStateStorage[0] }
            },
            {
                binding: 2,
                resource: { buffer: cellStateStorage[1] }
            }],
        }),
        this.device.createBindGroup({
            label: "Cell renderer bind group B",
            layout: bindGroupLayout,
            entries: [
            {
                binding: 0,
                resource: { buffer: uniformBuffer }
            },
            {
                binding: 1,
                resource: { buffer: cellStateStorage[1] }
            },
            {
                binding: 2,
                resource: { buffer: cellStateStorage[0] }
            }],
        }),
        ];

        setInterval(() => this.update(), UPDATE_INTERVAL);
    }

    public fragmentShaderStage() {

    }

    public async initDevice() {
        if (!navigator.gpu) {
            throw new Error("WebGPU not supported on this browser.");
        }

        const adapter = await navigator.gpu?.requestAdapter() as GPUAdapter | null;
        if (adapter === null) {
            throw new Error("No appropriate GPUAdapter found.");
        }

        const device = await adapter.requestDevice() as GPUDevice | null;
        if (device === null) {
            throw new Error("Could not find device");
        }

        this.device = device
    }

    public initCanvas() {
        const context = this.canvas.getContext("webgpu") as GPUCanvasContext | null;
        if (context === null) {
            throw new Error("Could not find context element");
        }

        this.context = context

        const canvasFormat = navigator.gpu.getPreferredCanvasFormat() as GPUTextureFormat;
        context.configure({
            device: this.device,
            format: canvasFormat,
        });

        this.canvasFormat = canvasFormat
    }

    public update() {
        // Clear the canvas with a render pass
        const encoder  = this.device.createCommandEncoder() as GPUCommandEncoder | null;
        if (encoder === null) {
            throw new Error("Could not find encoder");
        }

        // ComputePass
        const computePass = encoder.beginComputePass();

        computePass.setPipeline(this.simulationPipeline);
        computePass.setBindGroup(0, this.bindGroups[this.step % 2]);

        const workgroupCount = Math.ceil(this.gridSize / this.workgroupSize);
        computePass.dispatchWorkgroups(workgroupCount, workgroupCount)

        computePass.end()

        this.step++;

        const pass = encoder.beginRenderPass({
            colorAttachments: [{
                view: this.context.getCurrentTexture().createView(),
                loadOp: "clear",
                clearValue: { r: 0.2, g: 0.2, b: 0.2, a: 1.0 },
                storeOp: "store",
            }]
        });

        // Draw the square.
        pass.setPipeline(this.pipeline);
        pass.setBindGroup(0, this.bindGroups[this.step % 2]);
        pass.setVertexBuffer(0, this.buffer);

        const instanceCount = this.gridSize * this.gridSize;
        pass.draw(this.vertices!.length / 2, instanceCount);

        pass.end();

        // Finish the command buffer and immediately submit it.
        this.device.queue.submit([encoder.finish()])
    }
}

