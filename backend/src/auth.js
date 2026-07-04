import { timingSafeEqual } from "node:crypto";

export function readBearerToken(request) {
  const authorization = request.headers.authorization ?? "";
  if (authorization.startsWith("Bearer ")) return authorization.slice("Bearer ".length).trim();
  return request.headers["x-agent-token"] ?? "";
}

export function requireAgentToken(request, expectedToken) {
  const token = readBearerToken(request);
  if (!safeEqual(token, expectedToken)) {
    throw Object.assign(new Error("Invalid agent token"), { statusCode: 401 });
  }
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
