/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  // Disable image optimization for static export
  images: {
    unoptimized: true,
  },
  // Needed for transformers.js WASM files (browser-only, no node bindings)
  webpack: (config, { isServer }) => {
    // Prevent webpack from polyfilling Node.js globals that would
    // cause @xenova/transformers to detect a Node environment.
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      crypto: false,
      process: false,
      perf_hooks: false,
      worker_threads: false,
    };

    // Replace onnxruntime-node with a stub so the static import in
    // @xenova/transformers resolves to a harmless empty object instead
    // of triggering a "onnxruntime is not defined" error.
    config.resolve.alias = {
      ...config.resolve.alias,
      'onnxruntime-node': false,
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
