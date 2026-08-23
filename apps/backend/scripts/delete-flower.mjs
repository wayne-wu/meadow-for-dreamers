import http from 'node:http';
import https from 'node:https';

const input = process.argv[2];
const apiBaseUrl = process.env.STUDIO_MEADOW_API_BASE_URL || process.env.API_BASE_URL || 'http://localhost:8787';

if (!input) {
  console.error('Usage: npm run delete-flower -- <flower_id | flower_<id>.png | path | image_url>');
  process.exit(1);
}

const flowerId = extractFlowerId(input);

if (!flowerId) {
  console.error(`Could not find a flower id in: ${input}`);
  console.error('Expected something like flower_abc-123.png or abc-123.');
  process.exit(1);
}

const response = await requestJson(`${apiBaseUrl.replace(/\/$/, '')}/api/flowers/${encodeURIComponent(flowerId)}`, 'DELETE');
const body = response.body;

if (response.statusCode < 200 || response.statusCode >= 300) {
  console.error(body?.error || `Delete failed with HTTP ${response.statusCode}`);
  process.exit(1);
}

console.log(`Deleted flower ${body.flower_id}`);
if (body.deleted_image_path) {
  console.log(`Deleted image ${body.deleted_image_path}`);
}

function extractFlowerId(value) {
  const trimmed = value.trim();
  const filenameMatch = trimmed.match(/flower_([A-Za-z0-9-]+)\.png(?:$|[?#])/);

  if (filenameMatch) {
    return filenameMatch[1];
  }

  const rawIdMatch = trimmed.match(/^[A-Za-z0-9-]{12,}$/);
  return rawIdMatch ? trimmed : null;
}

function requestJson(url, method) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const transport = parsedUrl.protocol === 'https:' ? https : http;
    const request = transport.request(
      parsedUrl,
      {
        method,
        headers: {
          Accept: 'application/json'
        }
      },
      (response) => {
        let rawBody = '';

        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          rawBody += chunk;
        });
        response.on('end', () => {
          let body = null;

          try {
            body = rawBody ? JSON.parse(rawBody) : null;
          } catch {
            body = null;
          }

          resolve({
            statusCode: response.statusCode || 0,
            body
          });
        });
      }
    );

    request.on('error', reject);
    request.end();
  });
}
