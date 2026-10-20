export const OFFICIAL_UPDATE_GUIDE_URL = "https://github.com/Formsmith746/SketchForge-3D#update-sketchforge-later";

export type AppUpdateStatus = {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  checkedAt: string;
  updateUrl: string;
  installationReady: boolean;
  requiresUpdateKey: boolean;
  updateMode?: "local" | "server" | "desktop";
  checkError?: string;
};

type ParsedVersion = {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
};

function parseVersion(value: string): ParsedVersion | null {
  const match = value.trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split(".") : [],
  };
}

function comparePrereleasePart(left: string, right: string) {
  const leftNumber = /^\d+$/.test(left) ? Number(left) : null;
  const rightNumber = /^\d+$/.test(right) ? Number(right) : null;
  if (leftNumber !== null && rightNumber !== null) return Math.sign(leftNumber - rightNumber);
  if (leftNumber !== null) return -1;
  if (rightNumber !== null) return 1;
  return left.localeCompare(right);
}

export function compareAppVersions(leftValue: string, rightValue: string) {
  const left = parseVersion(leftValue);
  const right = parseVersion(rightValue);
  if (!left || !right) return leftValue.trim().localeCompare(rightValue.trim());

  for (const key of ["major", "minor", "patch"] as const) {
    if (left[key] !== right[key]) return Math.sign(left[key] - right[key]);
  }
  if (!left.prerelease.length && !right.prerelease.length) return 0;
  if (!left.prerelease.length) return 1;
  if (!right.prerelease.length) return -1;

  const partCount = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < partCount; index += 1) {
    if (left.prerelease[index] === undefined) return -1;
    if (right.prerelease[index] === undefined) return 1;
    const comparison = comparePrereleasePart(left.prerelease[index], right.prerelease[index]);
    if (comparison !== 0) return comparison;
  }
  return 0;
}

export function appUpdateIsAvailable(currentVersion: string, latestVersion: string) {
  return compareAppVersions(latestVersion, currentVersion) > 0;
}
