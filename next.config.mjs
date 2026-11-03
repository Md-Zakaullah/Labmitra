/** @type {import('next').NextConfig} */
const nextConfig = {
  // Vercel par medical data files ko /api/chat function ke saath bundle karta hai
  outputFileTracingIncludes: {
    "/api/chat": ["./src/data/**/*"],
  },
};
export default nextConfig;
