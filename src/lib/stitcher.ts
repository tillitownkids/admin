// The stitcher is an external service. These helpers turn its failures into messages
// that say what went wrong, so a failed stitch can be diagnosed from the page.

/** Kept under the stitching page's 300-second limit so a slow stitch returns an error instead of being cut off. */
export const DEFAULT_STITCHER_TIMEOUT_MS = 280_000;

/** Returns the stitched video's URL, or throws with the service's own explanation. */
export function parseStitcherResponse(status: number, body: string): string {
  const text = body.trim();
  let data: { videoUrl?: unknown; url?: unknown; error?: unknown; message?: unknown } | null = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  const detail = typeof data?.error === 'string' ? data.error
    : typeof data?.message === 'string' ? data.message
    : text.slice(0, 300);

  if (status < 200 || status >= 300) {
    throw new Error(`The stitcher service rejected the request (HTTP ${status}): ${detail || 'no details returned'}`);
  }
  const videoUrl = data?.videoUrl || data?.url;
  if (typeof videoUrl !== 'string' || !videoUrl.startsWith('http')) {
    throw new Error(`The stitcher service finished without returning a video link: ${detail || 'empty response'}`);
  }
  return videoUrl;
}

export function describeStitcherError(error: unknown, serviceUrl: string, timeoutMs: number): string {
  const failure = error as { name?: string; message?: string; cause?: { code?: string; message?: string } } | null;
  let host = serviceUrl;
  try {
    host = new URL(serviceUrl).host;
  } catch {
    // Keep the raw value: an unparseable address is itself the problem.
  }

  if (failure?.name === 'TimeoutError' || failure?.name === 'AbortError') {
    return `The stitcher service did not finish within ${Math.round(timeoutMs / 1000)} seconds, so no video was saved. It may still be starting up or the episode may be too long for it; try again, and if it keeps happening the service needs more time or capacity.`;
  }
  // Node reports an unreachable host as a TypeError "fetch failed" with the reason on `cause`.
  if (failure?.name === 'TypeError' && /fetch failed/i.test(failure.message || '')) {
    const reason = failure.cause?.code || failure.cause?.message || 'no response';
    return `Could not reach the stitcher service at ${host} (${reason}). Check that the service is running and that STITCHER_SERVICE_URL points to it.`;
  }
  return failure?.message || 'Video stitching failed.';
}
