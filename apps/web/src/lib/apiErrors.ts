import { NextResponse } from "next/server";
import { LocalizedError, errorResponseFields, type ErrorKey } from "@/i18n/LocalizedError";
import type { MessageParams } from "@/i18n/locales";

type ExtraFields = Record<string, unknown>;

/** A JSON error response the UI shows translated; `extra` adds fields such as the current revision. */
export function errorResponse(key: ErrorKey, status: number, extra?: ExtraFields, params?: MessageParams) {
  return NextResponse.json({ ...extra, ...errorResponseFields(new LocalizedError(key, params)) }, { status });
}

/** A caught error as a JSON error response: its own message (English), or the fallback when it is not an Error. */
export function caughtErrorResponse(error: unknown, fallbackKey: ErrorKey, status: number, extra?: ExtraFields) {
  return NextResponse.json({ ...extra, ...errorResponseFields(error instanceof Error ? error : new LocalizedError(fallbackKey)) }, { status });
}
