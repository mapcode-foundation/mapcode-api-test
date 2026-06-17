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
        <span className="pill">{response ? `${response.status} OK` : "idle"}</span>
      </div>
      <div className="request">
        <span>{request?.method ?? "GET"}</span> {request?.path ?? "Waiting for run"}
      </div>
      <pre className="response">{response?.canonical ? JSON.stringify(response.canonical, null, 2) : "{}"}</pre>
    </article>
  );
}
