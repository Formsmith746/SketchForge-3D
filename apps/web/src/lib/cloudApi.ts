export type CloudStatus = {
  authenticated: true;
  user: {
    id: string;
    email: string;
    emailVerified: boolean;
    displayName: string | null;
    avatarUrl: string | null;
  };
  legal: {
    accepted: boolean;
    termsVersion: string;
    privacyVersion: string;
    termsUrl: string;
    privacyUrl: string;
    refundUrl: string;
    retentionUrl: string;
  };
  subscription: {
    status: string;
    periodEnd: number | null;
    cancelAtPeriodEnd: boolean;
    cancelAt: number | null;
    retentionDeleteEligibleAt: number | null;
  };
  entitlement: {
    projectAccess: "active" | "frozen" | "locked";
    graceEndsAt: number | null;
    canOpenEditor: boolean;
    canReadProjects: boolean;
    canWriteProjects: boolean;
    canExport: boolean;
    needsPaymentRecovery: boolean;
    route: "/cloud" | "/cloud/subscribe" | "/cloud/activating" | "/cloud/account";
  };
  storage: { usedBytes: number; allocatedBytes: number; quotaBytes: number };
  projectCount: number;
  deletionRequestedAt: number | null;
  deletionRequest: {
    status: string;
    executeAfter: number | null;
  } | null;
};

export type CloudProjectSummary = {
  id: string;
  name: string;
  sizeBytes: number;
  formatVersion: number;
  version: number;
  thumbnailVersion: number | null;
  createdAt: number;
  updatedAt: number;
};

export class CloudApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export type CloudUploadProgress = {
  loadedBytes: number;
  totalBytes: number;
  percent: number;
};

export async function cloudFetch<T>(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    credentials: "same-origin",
    cache: "no-store",
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const body = (await response.json().catch(() => null)) as (T & { error?: string; message?: string }) | null;
  if (!response.ok) throw new CloudApiError(response.status, body?.error ?? "REQUEST_FAILED", body?.message ?? "Request failed.");
  return body as T;
}

export function cloudUploadJson<T>(
  path: string,
  payload: unknown,
  {
    method = "PUT",
    onProgress,
  }: {
    method?: "POST" | "PUT" | "PATCH";
    onProgress?: (progress: CloudUploadProgress) => void;
  } = {},
) {
  const serialized = JSON.stringify(payload);
  const encodedBytes = new TextEncoder().encode(serialized).byteLength;
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, path);
    xhr.withCredentials = true;
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.setRequestHeader("Cache-Control", "no-store");

    const report = (loadedBytes: number, totalBytes = encodedBytes) => {
      const safeTotal = Math.max(1, totalBytes);
      const safeLoaded = Math.max(0, Math.min(safeTotal, loadedBytes));
      onProgress?.({
        loadedBytes: safeLoaded,
        totalBytes: safeTotal,
        percent: Math.round((safeLoaded / safeTotal) * 100),
      });
    };

    xhr.upload.onprogress = (event) => {
      report(event.loaded, event.lengthComputable && event.total > 0 ? event.total : encodedBytes);
    };
    xhr.upload.onload = () => report(encodedBytes);
    xhr.onerror = () => reject(new CloudApiError(0, "NETWORK_ERROR", "The Cloud upload could not be completed."));
    xhr.onabort = () => reject(new CloudApiError(0, "UPLOAD_ABORTED", "The Cloud upload was canceled."));
    xhr.onload = () => {
      let body: (T & { error?: string; message?: string }) | null = null;
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) as T & { error?: string; message?: string } : null;
      } catch {
        body = null;
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new CloudApiError(xhr.status, body?.error ?? "REQUEST_FAILED", body?.message ?? "Request failed."));
        return;
      }
      resolve(body as T);
    };

    report(0);
    xhr.send(serialized);
  });
}

export function cloudUploadBytes<T>(
  path: string,
  bytes: Uint8Array,
  {
    expectedVersion,
    onProgress,
  }: {
    expectedVersion: number;
    onProgress?: (progress: CloudUploadProgress) => void;
  },
) {
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", path);
    xhr.withCredentials = true;
    xhr.setRequestHeader("Content-Type", "application/vnd.sketchforge.project+zip");
    xhr.setRequestHeader("Cache-Control", "no-store");
    xhr.setRequestHeader("X-SketchForge-Expected-Version", String(expectedVersion));

    const report = (loadedBytes: number, totalBytes = bytes.byteLength) => {
      const safeTotal = Math.max(1, totalBytes);
      const safeLoaded = Math.max(0, Math.min(safeTotal, loadedBytes));
      onProgress?.({
        loadedBytes: safeLoaded,
        totalBytes: safeTotal,
        percent: Math.round((safeLoaded / safeTotal) * 100),
      });
    };

    xhr.upload.onprogress = (event) => report(event.loaded, event.lengthComputable && event.total > 0 ? event.total : bytes.byteLength);
    xhr.upload.onload = () => report(bytes.byteLength);
    xhr.onerror = () => reject(new CloudApiError(0, "NETWORK_ERROR", "The Cloud upload could not be completed."));
    xhr.onabort = () => reject(new CloudApiError(0, "UPLOAD_ABORTED", "The Cloud upload was canceled."));
    xhr.onload = () => {
      let response: (T & { error?: string; message?: string }) | null = null;
      try {
        response = xhr.responseText ? JSON.parse(xhr.responseText) as T & { error?: string; message?: string } : null;
      } catch {
        response = null;
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new CloudApiError(xhr.status, response?.error ?? "REQUEST_FAILED", response?.message ?? "Request failed."));
        return;
      }
      resolve(response as T);
    };

    report(0);
    xhr.send(body);
  });
}

export async function getCloudStatus() {
  return cloudFetch<CloudStatus>("/api/cloud/status");
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[index]}`;
}

export function formatUnixDate(value: number | null) {
  return value ? new Date(value * 1000).toLocaleDateString(undefined, { dateStyle: "medium" }) : "Not available";
}
