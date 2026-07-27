// E2E test server — compiled wrapper to avoid tsconfig references issue.
// Import the built dist directly, bypassing TypeScript project references.
import { createApp } from '../packages/entity-resolver-server/dist/index.js';
import { createServer } from 'node:http';

const app = createApp();
const server = createServer(async (req, res) => {
  const headers = new Headers();
  for (let i = 0; i < req.rawHeaders.length; i += 2) {
    headers.set(req.rawHeaders[i]!, req.rawHeaders[i + 1]!);
  }
  const url = `http://localhost${req.url}`;
  let body = null;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    body = await new Promise((resolve) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => resolve(Buffer.concat(chunks)));
    });
  }
  const webReq = new Request(url, { method: req.method, headers, body });
  const webRes = await app.fetch(webReq);
  res.writeHead(webRes.status, Object.fromEntries(webRes.headers));
  if (webRes.body) {
    const reader = webRes.body.getReader();
    const pump = async () => {
      const { done, value } = await reader.read();
      if (done) { res.end(); return; }
      res.write(value);
      await pump();
    };
    await pump();
  } else { res.end(); }
});

const port = parseInt(process.env.PORT ?? '3000', 10);
server.listen(port, () => console.log(`E2E server on :${port}`));
