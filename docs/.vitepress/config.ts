import { defineConfig } from 'vitepress';

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: 'Entity Resolution',
  description:
    'Industry-leading Entity Resolution for Node.js and Browser — stateless, WASM-accelerated, TypeScript-first',
  lang: 'en-US',

  head: [['link', { rel: 'icon', href: '/favicon.ico' }]],

  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    logo: '/logo.svg',

    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'API Reference', link: '/api/core/' },
      {
        text: 'Packages',
        items: [
          { text: 'core', link: '/api/core/' },
          { text: 'node', link: '/api/node/' },
          { text: 'browser', link: '/api/browser/' },
          { text: 'server', link: '/api/server/' },
          { text: 'cli', link: '/api/cli/' },
          { text: 'visual', link: '/api/visual/' },
        ],
      },
      {
        text: 'v0.1.0',
        items: [
          { text: 'GitHub', link: 'https://github.com/AgentiX-E/entity-resolution' },
          { text: 'npm', link: 'https://www.npmjs.com/org/agentix-e' },
        ],
      },
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Guides',
          items: [
            { text: 'Getting Started', link: '/guide/getting-started' },
            { text: 'Core Concepts', link: '/guide/core-concepts' },
            { text: 'Storage Backends', link: '/guide/storage-backends' },
            { text: 'Production Deployment', link: '/guide/production' },
            { text: 'Migrating from Splink / GoldenMatch', link: '/guide/migration' },
          ],
        },
      ],
      '/api/': [
        {
          text: 'Packages',
          items: [
            { text: 'core — Computation Engine', link: '/api/core/' },
            { text: 'node — Node.js Adapters', link: '/api/node/' },
            { text: 'browser — Browser Adapters', link: '/api/browser/' },
            { text: 'server — HTTP/gRPC/MCP API', link: '/api/server/' },
            { text: 'cli — Command-Line Tool', link: '/api/cli/' },
            { text: 'visual — Visualization', link: '/api/visual/' },
          ],
        },
      ],
      '/api/core/': [
        {
          text: '@agentix-e/entity-resolution-core',
          items: [
            { text: 'Overview', link: '/api/core/' },
            { text: 'API Reference', link: '/api/core/reference' },
          ],
        },
      ],
      '/api/node/': [
        {
          text: '@agentix-e/entity-resolution-node',
          items: [
            { text: 'Overview', link: '/api/node/' },
            { text: 'API Reference', link: '/api/node/reference' },
          ],
        },
      ],
      '/api/browser/': [
        {
          text: '@agentix-e/entity-resolution-browser',
          items: [
            { text: 'Overview', link: '/api/browser/' },
            { text: 'API Reference', link: '/api/browser/reference' },
          ],
        },
      ],
      '/api/server/': [
        {
          text: '@agentix-e/entity-resolution-server',
          items: [
            { text: 'Overview', link: '/api/server/' },
            { text: 'API Reference', link: '/api/server/reference' },
          ],
        },
      ],
      '/api/cli/': [
        {
          text: '@agentix-e/entity-resolution-cli',
          items: [
            { text: 'Overview', link: '/api/cli/' },
            { text: 'API Reference', link: '/api/cli/reference' },
          ],
        },
      ],
      '/api/visual/': [
        {
          text: '@agentix-e/entity-resolution-visual',
          items: [
            { text: 'Overview', link: '/api/visual/' },
            { text: 'API Reference', link: '/api/visual/reference' },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/AgentiX-E/entity-resolution' },
    ],

    search: {
      provider: 'local',
    },

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2025 Lambertyan — AgentiX-E',
    },

    editLink: {
      pattern: 'https://github.com/AgentiX-E/entity-resolution/edit/master/docs/:path',
      text: 'Edit this page on GitHub',
    },
  },

  // GitHub Pages base
  base: '/entity-resolution/',
});
