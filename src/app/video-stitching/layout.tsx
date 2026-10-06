// Stitching is a server action that waits for the external stitcher service, which can take
// minutes. The page is a client component, so the time limit is set here.
export const maxDuration = 300;

export default function VideoStitchingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
