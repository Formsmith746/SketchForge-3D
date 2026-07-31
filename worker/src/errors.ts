export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly publicMessage: string;

  constructor(status: number, code: string, publicMessage: string) {
    super(code);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.publicMessage = publicMessage;
  }
}

export function apiError(status: number, code: string, publicMessage: string) {
  return new ApiError(status, code, publicMessage);
}
