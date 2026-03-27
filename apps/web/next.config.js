/** @type {import('next').NextConfig} */
module.exports = {
  basePath: '',
  /**
   * 关键：把 dev 与 build 的产物目录隔离，避免并发/缓存损坏导致的
   * `Cannot find module './vendor-chunks/@ionic.js'` 白屏问题。
   *
   * - dev：NEXT_DIST_DIR=.next-dev
   * - build：默认 .next
   */
  distDir: process.env.NEXT_DIST_DIR || '.next',
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '**',
      },
      {
        protocol: 'https',
        hostname: 'i2.au.reastatic.net',
        port: '',
        pathname: '**',
      },
      /** Google OAuth 用户头像（lh3.googleusercontent.com） */
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        port: '',
        pathname: '**',
      },
    ],
    unoptimized: true,
  },
  /**
   * 静态导出仅用于 Capacitor：`CAP_EXPORT=1 next build`。
   * 默认 `next build` 不导出，以便保留 `app/api/*`（发起竞猜等服务端接口）。
   */
  output: process.env.CAP_EXPORT === '1' ? 'export' : undefined,
  swcMinify: true,
  transpilePackages: [
    '@ionic/react',
    '@ionic/core',
    '@stencil/core',
    'ionicons',
  ],
  webpack: (config, { dev }) => {
    // 开发期禁用持久缓存，降低 “chunk 丢失 -> 白屏” 概率（代价：热更新略慢）
    if (dev) config.cache = false;
    return config;
  },
};
