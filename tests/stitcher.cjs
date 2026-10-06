const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const source = readFileSync(resolve(__dirname, '../src/lib/stitcher.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 } }).outputText;
const exported = {};
new Function('exports', compiled)(exported);
const { parseStitcherResponse, describeStitcherError, DEFAULT_STITCHER_TIMEOUT_MS } = exported;

assert.equal(parseStitcherResponse(200, '{"videoUrl":"https://x/full.mp4"}'), 'https://x/full.mp4');
assert.equal(parseStitcherResponse(201, ' {"url":"https://x/full.mp4"} '), 'https://x/full.mp4');
assert.throws(() => parseStitcherResponse(500, '{"error":"ffmpeg exited with code 1"}'), /rejected the request \(HTTP 500\): ffmpeg exited with code 1/);
assert.throws(() => parseStitcherResponse(502, '<html>Bad Gateway</html>'), /HTTP 502\): <html>Bad Gateway/);
assert.throws(() => parseStitcherResponse(503, ''), /HTTP 503\): no details returned/);
assert.throws(() => parseStitcherResponse(200, '{"error":"upload failed"}'), /without returning a video link: upload failed/);
assert.throws(() => parseStitcherResponse(200, '<html>Welcome</html>'), /without returning a video link: <html>Welcome/);
assert.throws(() => parseStitcherResponse(200, ''), /without returning a video link: empty response/);
assert.throws(() => parseStitcherResponse(200, '{"videoUrl":"not-a-link"}'), /without returning a video link/);

const service = 'https://stitcher.example.com/stitch';
const timeout = Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
assert.match(describeStitcherError(timeout, service, 280000), /did not finish within 280 seconds, so no video was saved/);
const refused = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
assert.match(describeStitcherError(refused, 'http://localhost:3001/stitch', 280000), /Could not reach the stitcher service at localhost:3001 \(ECONNREFUSED\)/);
assert.match(describeStitcherError(new TypeError('fetch failed'), service, 280000), /at stitcher\.example\.com \(no response\)/);
assert.equal(describeStitcherError(new Error('The stitcher service rejected the request (HTTP 500): boom'), service, 280000), 'The stitcher service rejected the request (HTTP 500): boom');
assert.equal(describeStitcherError(null, service, 280000), 'Video stitching failed.');
assert.match(describeStitcherError(refused, 'not a url', 280000), /at not a url/);
assert.ok(DEFAULT_STITCHER_TIMEOUT_MS < 300000);

console.log('Stitcher: response parsing, service errors, timeouts and unreachable-service messages passed.');
