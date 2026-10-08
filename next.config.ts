import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The pipeline used to be one page per step. Each step now lives inside its episode,
  // so the old addresses lead to the matching place there.
  async redirects() {
    return [
      { source: "/story-generate", destination: "/episodes", permanent: false },
      { source: "/story-generate/:id", destination: "/episodes/:id/story", permanent: false },
      { source: "/script-generate", destination: "/episodes", permanent: false },
      { source: "/storyboard", destination: "/episodes", permanent: false },
      { source: "/episode-production", destination: "/episodes", permanent: false },
      { source: "/episode-production/:id", destination: "/episodes/:id/video", permanent: false },
      { source: "/video-stitching", destination: "/episodes", permanent: false },
      { source: "/video-approval", destination: "/episodes", permanent: false },
    ];
  },
};

export default nextConfig;
