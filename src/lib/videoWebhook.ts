export function parseVideoWebhookBody(body: string): unknown {
  try { return JSON.parse(body); } catch { return body.trim(); }
}

function records(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(records);
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  return [record, ...['body', 'json', 'result', 'scenes', 'results'].flatMap(key => records(record[key]))];
}

export function assertVideoWebhookResponse(status: number, body: string) {
  const data = parseVideoWebhookBody(body);
  const entries = records(data);
  const failure = entries.find(item => item.success === false || item.error ||
    ['failed', 'error', 'rejected'].includes(String(item.status).toLowerCase()));
  if (status < 200 || status >= 300 || failure) {
    const detail = failure?.error || failure?.message || body.trim() || 'Empty response';
    const message = typeof detail === 'string' ? detail : JSON.stringify(detail);
    throw new Error(`Video webhook failed (HTTP ${status}): ${message.slice(0, 500)}`);
  }
  return data;
}

export function videoWebhookAccepted(status: number, data: unknown): boolean {
  // Generic success:true or HTTP 200 is not evidence that a job was submitted.
  return status === 202 || records(data).some(item => item.accepted === true ||
    ['accepted', 'queued', 'pending', 'processing', 'running', 'submitted'].includes(String(item.status).toLowerCase()));
}

export function unconfirmedVideoResponse(status: number, body: string): Error {
  return new Error(`Video webhook returned HTTP ${status}, but no video URL or explicit job acceptance. Generation is unconfirmed. Response: ${body.trim().slice(0, 500) || '(empty)'}`);
}
