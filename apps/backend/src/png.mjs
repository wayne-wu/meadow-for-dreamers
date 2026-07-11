import { PNG } from 'pngjs';

const DATA_URL_PREFIX = 'data:image/png;base64,';
const MAX_FILE_BYTES = Number(process.env.MAX_FILE_BYTES || 3 * 1024 * 1024);
const MIN_VISIBLE_PIXELS = Number(process.env.MIN_VISIBLE_PIXELS || 240);
const MAX_IMAGE_WIDTH = Number(process.env.MAX_IMAGE_WIDTH || 2048);
const MAX_IMAGE_HEIGHT = Number(process.env.MAX_IMAGE_HEIGHT || 4096);

export function decodePngDataUrl(imageBase64) {
  if (typeof imageBase64 !== 'string' || !imageBase64.startsWith(DATA_URL_PREFIX)) {
    throw Object.assign(new Error('image_base64 must be a PNG data URL'), { statusCode: 400 });
  }

  const encoded = imageBase64.slice(DATA_URL_PREFIX.length);
  const buffer = Buffer.from(encoded, 'base64');

  if (!buffer.length || buffer.length > MAX_FILE_BYTES) {
    throw Object.assign(new Error('PNG file is empty or too large'), { statusCode: 413 });
  }

  const pngSignature = '89504e470d0a1a0a';
  if (buffer.subarray(0, 8).toString('hex') !== pngSignature) {
    throw Object.assign(new Error('Uploaded image is not a valid PNG'), { statusCode: 400 });
  }

  return buffer;
}

export function inspectPng(buffer) {
  let png;

  try {
    png = PNG.sync.read(buffer);
  } catch {
    throw Object.assign(new Error('PNG could not be decoded'), { statusCode: 400 });
  }

  if (png.width > MAX_IMAGE_WIDTH || png.height > MAX_IMAGE_HEIGHT) {
    throw Object.assign(new Error('PNG dimensions are too large'), { statusCode: 400 });
  }

  let visiblePixelCount = 0;
  const colorCounts = new Map();

  for (let i = 0; i < png.data.length; i += 4) {
    const alpha = png.data[i + 3];

    if (alpha > 24) {
      visiblePixelCount += 1;

      const red = png.data[i];
      const green = png.data[i + 1];
      const blue = png.data[i + 2];
      const bucket = `${Math.round(red / 32) * 32},${Math.round(green / 32) * 32},${Math.round(blue / 32) * 32}`;
      colorCounts.set(bucket, (colorCounts.get(bucket) || 0) + 1);
    }
  }

  if (visiblePixelCount < MIN_VISIBLE_PIXELS) {
    throw Object.assign(new Error('Flower drawing is too small'), { statusCode: 422 });
  }

  return {
    width: png.width,
    height: png.height,
    visiblePixelCount,
    dominantColor: getDominantColor(colorCounts)
  };
}

function getDominantColor(colorCounts) {
  let dominantBucket = null;
  let dominantCount = 0;

  for (const [bucket, count] of colorCounts.entries()) {
    if (count > dominantCount) {
      dominantBucket = bucket;
      dominantCount = count;
    }
  }

  if (!dominantBucket) return null;

  const [red, green, blue] = dominantBucket.split(',').map((value) => Math.max(0, Math.min(255, Number(value))));
  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
}

function toHex(value) {
  return value.toString(16).padStart(2, '0').toUpperCase();
}

