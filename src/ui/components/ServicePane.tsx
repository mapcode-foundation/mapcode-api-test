import type { RequestCase, ServiceResponse } from "../../shared/types";

export function ServicePane({
  title,
  request,
  response
}: {
  title: string;
  request?: RequestCase;
  response?: ServiceResponse;
}) {
  return (
    <article className="pane">
      <div className="pane-title">
        <h2>{title}</h2>
        <span className={response ? `pill ${response.status >= 400 ? "error" : "ok"}` : "pill"}>
          {response ? response.status : "idle"}
        </span>
      </div>
      <div className="request">
        <span>{request?.method ?? "GET"}</span> {request ? formatRequestPath(request) : "Waiting for run"}
      </div>
      <pre className="response">{response && response.canonical !== undefined ? JSON.stringify(response.canonical, null, 2) : "{}"}</pre>
    </article>
  );
}

function formatRequestPath(request: RequestCase): string {
  const params = new URLSearchParams(request.query ?? {});
  const query = params.toString();
  return query.length > 0 ? `${request.path}?${query}` : request.path;
}
