# Health API Data Flow

## Endpoint

- Method: `GET`
- Path: `/health`
- Request body and query parameters: none are read by this endpoint.
- Successful response: HTTP `200` with a JSON body.

## Request-to-response flow

1. [server.mts](../../server.mts) exposes the Vercel-compatible Express entrypoint. [runtime.ts](../../runtime.ts) loads environment variables, validates them through [config/env.ts](../../config/env.ts), and composes the API app.
2. During app construction, [bootstrap/create-app.ts](../../bootstrap/create-app.ts) creates the health routes and injects `config.environment` and `apiRuntime.serviceName`.
3. For local development, [dev-server.ts](../../dev-server.ts) attaches the Express app to a Node HTTP server and listens on the configured host and port.
4. A client sends `GET /health`. The health router, defined in [routes/health.route.ts](./routes/health.route.ts), matches the path and invokes the health controller.
5. [controllers/health.controller.ts](./controllers/health.controller.ts) calls `service.getHealth()`, sets the HTTP status to `200`, and sends the returned value as JSON.
6. [services/health.service.ts](./services/health.service.ts) builds the response. It does not read request data, a database, or an external service.
7. Express sends the JSON response back to the client.

## Response field origins

| Field | Source |
| --- | --- |
| `status` | Static value `"ok"` in the health service. |
| `service` | `apiRuntime.serviceName`, currently `"api"`, injected when the app creates the health routes. See [constants/runtime/api.ts](../../constants/runtime/api.ts). |
| `environment` | `NODE_ENV`, validated and mapped to `config.environment`, then injected into the health routes at app construction. |

The response contract is `ApiHealthResponse` in [health-response.ts](../../../../packages/types/src/api/health/health-response.ts).

## Example

```http
HTTP/1.1 200 OK
Content-Type: application/json

{"status":"ok","service":"api","environment":"production"}
```

The environment value in the example depends on the validated `NODE_ENV` setting.

## Verification

[tests/health.route.test.ts](./tests/health.route.test.ts) makes an HTTP request to `GET /health` and verifies the status and response body.
