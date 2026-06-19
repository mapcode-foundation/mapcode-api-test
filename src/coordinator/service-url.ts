export function resolveServiceUrl(baseUrl: string, path: string): URL {
  const url = new URL(baseUrl);
  const basePath = url.pathname === "/" ? "" : url.pathname.replace(/\/+$/, "");
  const requestPath = path.startsWith("/") ? path : `/${path}`;

  url.pathname = `${basePath}${requestPath}`;
  url.search = "";
  url.hash = "";

  return url;
}

export function normalizeServiceBaseUrl(value: string): string {
  const url = new URL(value);
  url.search = "";
  url.hash = "";
  if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString().replace(/\/$/, "");
}
