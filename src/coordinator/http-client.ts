import { canonicalizeBody } from "./canonicalizer";
import { resolveServiceUrl } from "./service-url";
import type { RequestCase, ServiceKind, ServiceResponse } from "../shared/types";

export async function fetchService(
  service: ServiceKind,
  baseUrl: string,
  request: RequestCase,
  options: { signal?: AbortSignal; timeoutMs?: number } = {}
): Promise<ServiceResponse> {
  const url = resolveServiceUrl(baseUrl, request.path);

  for (const [key, value] of Object.entries(request.query ?? {})) {
    url.searchParams.set(key, value);
  }

  const accept = request.format === "json" ? "application/json" : "application/xml";
  const timeoutMs = options.timeoutMs ?? 30_000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error(`Request timed out after ${timeoutMs}ms`)), timeoutMs);
  const abortFromCaller = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) abortFromCaller();
  options.signal?.addEventListener("abort", abortFromCaller, { once: true });

  let response: Response;
  let body: string;
  try {
    response = await fetch(url, { method: request.method, headers: { Accept: accept }, signal: controller.signal });
    body = await response.text();
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abortFromCaller);
  }

  return {
    service,
    status: response.status,
    contentType: response.headers.get("content-type") ?? "",
    body,
    canonical: canonicalizeBody(body, request.format)
  };
}
