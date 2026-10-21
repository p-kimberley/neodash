const ReactRefreshWebpackPlugin = require('@pmmmwh/react-refresh-webpack-plugin');
const CircularDependencyPlugin = require('circular-dependency-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const os = require('os');

const circularPlugin = new CircularDependencyPlugin({
  // exclude detection of files based on a RegExp
  exclude: /a\.js|node_modules/,
  // add errors to webpack instead of warnings
  failOnError: false,
  // allow import cycles that include an asyncronous import,
  // e.g. via import(/* webpackMode: "weak" */ './file.js')
  allowAsyncCycles: false,
  // set the current working directory for displaying module paths
  cwd: process.cwd(),
});

const circularValidation = false;

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

const rules = [
  {
    test: /\.(js|jsx|ts|tsx)$/,
    exclude: /(node_modules)/,
    loader: 'babel-loader',
    options: {
      // preset-typescript here (not only in .babelrc) so shared files outside src/, such as
      // server/src/codec.ts, are compiled too.
      presets: ['@babel/env', '@babel/preset-typescript'],
      //plugins: [isDevelopment && require.resolve('react-refresh/babel')].filter(Boolean),
    },
  },
  {
    test: /\.css$/,
    use: [
      'style-loader',
      'css-loader',
      { loader: 'postcss-loader', options: { postcssOptions: { config: false, plugins: [stripRemoteImports] } } },
    ],
  },
  {
    test: /\.pcss$/,
    use: ['style-loader', 'css-loader', 'postcss-loader'],
  },
  {
    test: /\.js$/,
    exclude: /(node_modules\/react-leaflet-heatmap-layer-v3)/,
    enforce: 'pre',
    use: ['source-map-loader'],
  },
  {
    test: /.(png|svg|jpe?g|gif|woff2?|ttf|eot)$/,
    use: ['file-loader'],
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
      rules: rules,
    },
    resolve: { extensions: ['*', '.js', '.jsx', '.ts', '.tsx'] },
    output: {
      filename: 'bundle.js',
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
    plugins: production
      ? []
      : [new ReactRefreshWebpackPlugin(), ...(circularValidation ? [circularPlugin] : [])],
    ignoreWarnings: [/Failed to parse source map/],
  };
};
