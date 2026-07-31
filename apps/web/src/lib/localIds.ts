let fallbackIdCounter = 0;

export function createLocalId(prefix: string) {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) {
    return `${prefix}-${uuid}`;
  }

  fallbackIdCounter = (fallbackIdCounter + 1) % Number.MAX_SAFE_INTEGER;
  const timestamp = Date.now().toString(36);
  const counter = fallbackIdCounter.toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${timestamp}-${counter}-${random}`;
}
