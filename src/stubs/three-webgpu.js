// Stand-in for 'three/webgpu' (see the alias in webpack.config.js). three-render-objects imports
// WebGPURenderer but only uses it when asked to render with WebGPU, which NeoDash never does; the real
// module would add ~3.5 MB (three.js's WebGPU and node-material system) to the bundle.
export class WebGPURenderer {
  constructor() {
    throw new Error('WebGPU rendering is not included in this build');
  }
}
