export type ApiSuccess<T> = { success: true; data: T; error: null };
export type ApiError = { success: false; data: null; error: { code: string; message: string } };
export function ok<T>(data: T): ApiSuccess<T> { return { success: true, data, error: null }; }
export function fail(code: string, message: string, status?: number) { return { body: { success: false, data: null, error: { code, message } }, status: status ?? 400 }; }
