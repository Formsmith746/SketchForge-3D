export const PNG_DATA_URL_PREFIX = "data:image/png;base64,";
export const MAX_THUMBNAIL_BYTES = 5 * 1024 * 1024;
export const MAX_THUMBNAIL_REQUEST_BYTES = Math.ceil((MAX_THUMBNAIL_BYTES * 4) / 3) + PNG_DATA_URL_PREFIX.length + 2048;
export const MAX_THUMBNAIL_DIMENSION = 4096;
export const MAX_THUMBNAIL_PIXELS = 16_777_216;

export function thumbnailByteLength(dataUrl: string) {
  if (!dataUrl.startsWith(PNG_DATA_URL_PREFIX)) return null;
  const encoded = dataUrl.slice(PNG_DATA_URL_PREFIX.length);
  if (encoded.length % 4 === 1 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return null;
  const padding = encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0;
  return Math.floor((encoded.length * 3) / 4) - padding;
}

export function thumbnailBytesFromDataUrl(dataUrl: string) {
  const byteLength = thumbnailByteLength(dataUrl);
  if (byteLength === null || byteLength > MAX_THUMBNAIL_BYTES) return null;
  const binary = atob(dataUrl.slice(PNG_DATA_URL_PREFIX.length));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < pngSignature.length || pngSignature.some((value, index) => bytes[index] !== value)) return null;
  return bytes;
}

function readUint32(bytes: Uint8Array, offset: number) {
  return (((bytes[offset] << 24) >>> 0) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]) >>> 0;
}

export function thumbnailPngDimensions(bytes: Uint8Array) {
  if (bytes.length < 33) return null;
  if (readUint32(bytes, 8) !== 13 || String.fromCharCode(...bytes.slice(12, 16)) !== "IHDR") return null;
  const width = readUint32(bytes, 16);
  const height = readUint32(bytes, 20);
  if (!width || !height || width > MAX_THUMBNAIL_DIMENSION || height > MAX_THUMBNAIL_DIMENSION) return null;
  if (width * height > MAX_THUMBNAIL_PIXELS) return null;
  const bitDepth = bytes[24];
  const colorType = bytes[25];
  const compression = bytes[26];
  const filter = bytes[27];
  const interlace = bytes[28];
  const validBitDepths: Record<number, readonly number[]> = {
    0: [1, 2, 4, 8, 16],
    2: [8, 16],
    3: [1, 2, 4, 8],
    4: [8, 16],
    6: [8, 16],
  };
  if (!validBitDepths[colorType]?.includes(bitDepth) || compression !== 0 || filter !== 0 || interlace > 1) return null;

  let offset = 8;
  let chunks = 0;
  let sawIdat = false;
  while (offset < bytes.length) {
    chunks += 1;
    if (chunks > 4096 || offset + 12 > bytes.length) return null;
    const length = readUint32(bytes, offset);
    const end = offset + 12 + length;
    if (!Number.isSafeInteger(end) || end > bytes.length) return null;
    const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
    if (chunks === 1 && (type !== "IHDR" || length !== 13)) return null;
    if (chunks > 1 && type === "IHDR") return null;
    if (type === "IDAT") {
      if (length === 0) return null;
      sawIdat = true;
    }
    if (type === "IEND") {
      if (length !== 0 || !sawIdat || end !== bytes.length) return null;
      return { width, height };
    }
    offset = end;
  }
  return null;
}
