const path = require('path');
const ReactRefreshWebpackPlugin = require('@pmmmwh/react-refresh-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const os = require('os');

// Removes @import of remote stylesheets (e.g. Google Fonts) from third-party CSS, so the app makes no
// requests outside its own origin. The fonts themselves are bundled in src/fonts.ts.
const stripRemoteImports = () => ({
  postcssPlugin: 'strip-remote-imports',
  AtRule: {
    import: (rule) => {
      if (/^(url\()?\s*['"]?https?:/i.test(rule.params)) {
        rule.remove();
      }
    },
  },
});
stripRemoteImports.postcss = true;

// CSS source maps are left out of production builds: css-loader 7 would embed them in the JS bundle.
const rules = (production) => [
  {
    // ESM packages (e.g. @mui/x-date-pickers 8) import '@mui/material/Button' without an extension;
    // MUI 5 has no exports map, so allow extension-less imports from packages' .mjs files.
    test: /\.m?js$/,
    include: /node_modules/,
    resolve: { fullySpecified: false },
  },
  {
    test: /\.(js|jsx|ts|tsx)$/,
    exclude: /(node_modules)/,
    loader: 'babel-loader',
    options: {
      // preset-typescript here (not only in .babelrc) so shared files outside src/, such as
      // server/src/codec.ts, are compiled too.
      presets: ['@babel/env', '@babel/preset-typescript'],
      // React Fast Refresh in development (the webpack plugin below needs this Babel half).
      plugins: production ? [] : [require.resolve('react-refresh/babel')],
    },
  },
  {
    test: /\.css$/,
    use: [
      'style-loader',
      { loader: 'css-loader', options: { sourceMap: !production } },
      { loader: 'postcss-loader', options: { postcssOptions: { config: false, plugins: [stripRemoteImports] } } },
    ],
  },
  {
    test: /\.pcss$/,
    use: ['style-loader', { loader: 'css-loader', options: { sourceMap: !production } }, 'postcss-loader'],
  },
  {
    test: /\.js$/,
    enforce: 'pre',
    use: ['source-map-loader'],
  },
  {
    // MapLibre's web worker, emitted as its own file; MapView passes its URL to maplibregl.setWorkerUrl.
    test: /maplibre-gl-worker\.mjs$/,
    type: 'asset/resource',
  },
  {
    // Images and fonts referenced from CSS or code (file-loader is replaced by asset modules).
    test: /.(png|svg|jpe?g|gif|woff2?|ttf|eot)$/,
    type: 'asset/resource',
  },
];

// TODO - move this config to a dedicated environment file.
// TODO - use process.env.NODE_ENV which will directly return the environment string "development", "production".
module.exports = (env) => {
  const production = env.production;
  return {
    experiments: {
      topLevelAwait: true,
    },
    entry: ['./src/index.tsx'],
    mode: production ? 'production' : 'development',
    // Minifying with one worker per core (the default) runs out of memory on many-core build
    // machines and in Docker, so cap the workers.
    optimization: production
      ? { minimizer: [new TerserPlugin({ parallel: Math.min(4, Math.max(1, os.cpus().length - 1)) })] }
      : undefined,
    devtool: production ? 'source-map' : 'eval-cheap-module-source-map',
    module: {
      rules: rules(production),
    },
    resolve: {
      extensions: ['.js', '.jsx', '.ts', '.tsx'],
      alias: {
        // Only used for opt-in WebGPU rendering in the 3D graph library; see src/stubs/three-webgpu.js.
        'three/webgpu$': path.resolve(__dirname, 'src/stubs/three-webgpu.js'),
      },
    },
    output: {
      filename: 'bundle.js',
      // Remove files from earlier builds (the build script copies public/ in afterwards).
      clean: true,
    },
    devServer: {
      // The backend (server/) listens on 3000; the dev server proxies its routes so the app is
      // same-origin, exactly as in production.
      port: 5173,
      hot: true,
      compress: true,
      historyApiFallback: true,
      proxy: [
        {
          context: ['/api', '/auth', '/healthz', '/readyz'],
          target: process.env.BACKEND_URL || 'http://localhost:3000',
        },
      ],
      client: {
        overlay: {
          warnings: false,
        },
      },
    },
    // The upstream build uploaded source maps to Neo4j's Sentry; this fork does not report anywhere.
    plugins: production ? [] : [new ReactRefreshWebpackPlugin()],
    ignoreWarnings: [
      /Failed to parse source map/,
      // MapLibre loads its worker with a dynamic import of a runtime URL (see MapView.tsx); that's intended.
      { module: /maplibre-gl/, message: /Critical dependency/ },
    ],
  };
};
