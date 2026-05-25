import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/** Dev-only: proxy Anthropic so the API key stays on the server, not in the browser bundle. */
export function anthropicProxyPlugin(
  apiKey: string,
  source: 'none' | 'env' | 'secrets-file'
): Plugin {
  const configured = Boolean(apiKey);

  return {
    name: 'worldgen-anthropic-proxy',
    config() {
      return {
        define: {
          'import.meta.env.WG_ANTHROPIC_KEY_CONFIGURED': JSON.stringify(configured ? 'true' : 'false'),
          'import.meta.env.WG_ANTHROPIC_KEY_SOURCE': JSON.stringify(source)
        }
      };
    },
    configureServer(server) {
      server.middlewares.use(
        '/api/worldgen/anthropic/v1/messages',
        async (req, res: ServerResponse) => {
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.end('Method not allowed');
            return;
          }
          if (!apiKey) {
            res.statusCode = 503;
            res.setHeader('content-type', 'application/json');
            res.end(
              JSON.stringify({
                error: 'No Anthropic API key — set ANTHROPIC_API_KEY in .env and restart dev:worldgen'
              })
            );
            return;
          }

          try {
            const body = await readBody(req);
            const upstream = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
              },
              body: new Uint8Array(body)
            });

            res.statusCode = upstream.status;
            const contentType = upstream.headers.get('content-type');
            if (contentType) {
              res.setHeader('content-type', contentType);
            }
            res.end(await upstream.text());
          } catch (e) {
            res.statusCode = 500;
            res.setHeader('content-type', 'application/json');
            const msg = e instanceof Error ? e.message : 'Proxy error';
            res.end(JSON.stringify({ error: msg }));
          }
        }
      );
    }
  };
}
