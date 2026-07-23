// Simple HTTP server entry point for Playwright E2E tests.
import { createApp } from '../packages/entity-resolver-server/src/index.js';
import { createServer } from 'node:http';

const app = createApp();
const server = createServer(async (req, res) => {
  // Convert Node.js IncomingMessage to Web Request
  const headers = new Headers();
  for (let i = 0; i < req.rawHeaders.length; i += 2) {
    headers.set(req.rawHeaders[i]!, req.rawHeaders[i + 1]!);
  }
  const url = `http://localhost${req.url}`;

  let body: BodyInit | null = null;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    body = await new Promise((resolve) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => resolve(Buffer.concat(chunks)));
    });
  }

  const webReq = new Request(url, {
    method: req.method,
    headers,
    body,
  });

  const webRes = await app.fetch(webReq);

  res.writeHead(webRes.status, Object.fromEntries(webRes.headers.entries()));
  const resBody = await webRes.arrayBuffer();
  res.end(Buffer.from(resBody));
});

server.listen(3000, () => {
  console.log('E2E test server running on http://localhost:3000');
});
