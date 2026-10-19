export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export class ApiError extends Error {
    constructor(message: string, readonly status: number) {
        super(message);
        this.name = "ApiError";
    }
}

/**
 * Typed JSON fetch.
 *
 * `signal` is threaded through so React Query can cancel a request when the
 * component unmounts or the key changes — previously every panel fetched
 * manually and a stale response could still land after a universe switch.
 */
export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
    const res = await fetch(`${API_URL}${path}`, { signal });
    if (!res.ok) throw new ApiError(`GET ${path} failed`, res.status);
    return (await res.json()) as T;
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${API_URL}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
    });
    if (!res.ok) throw new ApiError(`POST ${path} failed`, res.status);
    return (await res.json()) as T;
}
