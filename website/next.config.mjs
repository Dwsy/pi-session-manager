import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  output: 'export',
  basePath: process.env.GITHUB_ACTIONS ? '/pi-session-manager' : '',
  reactStrictMode: true,
  images: {
    unoptimized: true,
  },
};

export default withMDX(config);
