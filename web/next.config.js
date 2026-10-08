/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  output: 'export',
  // onnxruntime-web ships a very large single-line bundle that the SWC
  // minifier fails to parse; Terser handles it.
  swcMinify: false,
  // Disable image optimization for static export
  images: {
    unoptimized: true,
  },
  // Needed for Transformers.js WASM files (browser-only, no node bindings)
  webpack: (config, { isServer }) => {
    // Prevent webpack from polyfilling Node.js globals that would
    // cause @huggingface/transformers to detect a Node environment.
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      crypto: false,
      process: false,
      perf_hooks: false,
      worker_threads: false,
    };

    // Force the browser build. @huggingface/transformers exposes a `node`
    // export condition that pulls onnxruntime-node + unresolvable wasm worker
    // files; the app only ever runs this in the browser, so alias the bare
    // specifier to the web bundle for both the client and (unused) server graph.
    config.resolve.alias = {
      ...config.resolve.alias,
      'onnxruntime-node': false,
      '@huggingface/transformers': path.resolve(
        __dirname,
        'node_modules/@huggingface/transformers/dist/transformers.web.js',
      ),
    };

    // Ignore .node native binary files
    config.module = config.module || {};
    config.module.rules = config.module.rules || [];
    config.module.rules.push({
      test: /\.node$/,
      loader: 'null-loader',
    });

    // Allow importing WASM from transformers.js
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      syncWebAssembly: true,
    };

    return config;
  },
};

module.exports = nextConfig;
