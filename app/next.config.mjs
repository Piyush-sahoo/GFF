/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
  // The dense loader dynamically imports vendor/gff-index/lib/gff-index.mjs at a
  // runtime-computed path, so tracing cannot see it. Include the vendored index
  // and corpus explicitly or the route 500s on Vercel while working locally.
  outputFileTracingIncludes: {
    "/api/**": ["./vendor/**"],
  },
};

export default nextConfig;
