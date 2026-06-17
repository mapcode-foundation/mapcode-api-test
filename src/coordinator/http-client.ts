import { canonicalizeBody } from "./canonicalizer";
import type { RequestCase, ServiceKind, ServiceResponse } from "../shared/types";

export async function fetchService(
  service: ServiceKind,
  baseUrl: string,
  request: RequestCase
): Promise<ServiceResponse> {
  const url = new URL(request.path, baseUrl);

  for (const [key, value] of Object.entries(request.query ?? {})) {
    url.searchParams.set(key, value);
  }

  const accept = request.format === "json" ? "application/json" : "application/xml";
  const response = await fetch(url, { method: request.method, headers: { Accept: accept } });
  const body = await response.text();

  return {
    service,
    status: response.status,
    contentType: response.headers.get("content-type") ?? "",
    body,
    canonical: canonicalizeBody(body, request.format)
  };
}
