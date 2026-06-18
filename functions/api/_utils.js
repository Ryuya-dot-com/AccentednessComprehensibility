export function nowIso() {
  return new Date().toISOString();
}

export function nowMs() {
  return Date.now();
}

const API_SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
};

export function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...API_SECURITY_HEADERS,
      ...headers,
    },
  });
}

export function textResponse(text, status = 200, headers = {}) {
  return new Response(text, {
    status,
    headers: {
      "cache-control": "no-store",
      ...API_SECURITY_HEADERS,
      ...headers,
    },
  });
}

function httpError(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

export function errorResponse(message, status = 400) {
  return jsonResponse({ ok: false, error: message }, status);
}

export async function readJson(request, maxBytes = 262144) {
  const contentLength = Number.parseInt(request.headers.get("content-length") || "0", 10);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw httpError("Request body is too large.", 413);
  }
  try {
    return await request.json();
  } catch (error) {
    throw httpError("Request body must be valid JSON.", 400);
  }
}

export function requireDb(env) {
  if (!env.DB) {
    throw new Error("D1 binding DB is not configured.");
  }
  return env.DB;
}

let accessJwksCache = {
  issuer: "",
  expiresAt: 0,
  keys: [],
};

function normalizeAccessIssuer(teamDomain) {
  const normalized = cleanText(teamDomain)
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/g, "");
  return normalized ? `https://${normalized}` : "";
}

function base64UrlToBytes(value) {
  const padded = cleanText(value).replace(/-/g, "+").replace(/_/g, "/");
  const base64 = padded.padEnd(Math.ceil(padded.length / 4) * 4, "=");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function base64UrlJson(value) {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(value)));
}

async function accessJwks(issuer) {
  const now = Date.now();
  if (accessJwksCache.issuer === issuer && accessJwksCache.expiresAt > now) {
    return accessJwksCache.keys;
  }
  const response = await fetch(`${issuer}/cdn-cgi/access/certs`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw httpError("Cloudflare Access public keys could not be loaded.", 503);
  }
  const data = await response.json();
  const keys = Array.isArray(data.keys) ? data.keys : [];
  if (!keys.length) {
    throw httpError("Cloudflare Access public keys are empty.", 503);
  }
  accessJwksCache = {
    issuer,
    expiresAt: now + 10 * 60 * 1000,
    keys,
  };
  return keys;
}

function accessAudienceMatches(claim, expected) {
  if (Array.isArray(claim)) return claim.includes(expected);
  return cleanText(claim) === expected;
}

export async function requireCloudflareAccess(request, env) {
  const audience = cleanText(env.CF_ACCESS_AUD || env.POLICY_AUD);
  const issuer = normalizeAccessIssuer(env.CF_ACCESS_TEAM_DOMAIN);
  const allowedEmails = cleanText(env.CF_ACCESS_ALLOWED_EMAILS)
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  const configured = Boolean(audience || issuer || allowedEmails.length);
  if (!configured) return null;
  if (!audience || !issuer) {
    throw httpError("Cloudflare Access authorization is not configured.", 500);
  }

  const token = cleanText(request.headers.get("cf-access-jwt-assertion"));
  if (!token) {
    throw httpError("Cloudflare Access authorization is required.", 401);
  }
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw httpError("Cloudflare Access JWT is malformed.", 401);
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = base64UrlJson(encodedHeader);
  if (header.alg !== "RS256" || !header.kid) {
    throw httpError("Cloudflare Access JWT header is not accepted.", 401);
  }

  const keys = await accessJwks(issuer);
  const jwk = keys.find((key) => key.kid === header.kid);
  if (!jwk) {
    throw httpError("Cloudflare Access signing key was not found.", 401);
  }
  const cryptoKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const signatureOk = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    base64UrlToBytes(encodedSignature),
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
  );
  if (!signatureOk) {
    throw httpError("Cloudflare Access JWT signature is invalid.", 401);
  }

  const payload = base64UrlJson(encodedPayload);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (cleanText(payload.iss) !== issuer) {
    throw httpError("Cloudflare Access issuer is invalid.", 401);
  }
  if (!accessAudienceMatches(payload.aud, audience)) {
    throw httpError("Cloudflare Access audience is invalid.", 401);
  }
  if (payload.exp && Number(payload.exp) <= nowSeconds) {
    throw httpError("Cloudflare Access session has expired.", 401);
  }
  if (payload.nbf && Number(payload.nbf) > nowSeconds + 30) {
    throw httpError("Cloudflare Access session is not active yet.", 401);
  }

  const email = cleanText(
    payload.email || request.headers.get("cf-access-authenticated-user-email"),
  ).toLowerCase();
  if (allowedEmails.length && !allowedEmails.includes(email)) {
    throw httpError("Cloudflare Access user is not allowed.", 403);
  }
  return payload;
}

export async function requireAdmin(request, env) {
  const accessPayload = await requireCloudflareAccess(request, env);
  const token = cleanText(env.ADMIN_TOKEN);
  if (!token) {
    const err = new Error("Admin authorization is not configured.");
    err.status = 500;
    throw err;
  }
  const received = cleanText(request.headers.get("x-admin-token"));
  if (!constantTimeEqual(received, token)) {
    const err = new Error("Admin authorization failed.");
    err.status = 401;
    throw err;
  }
  return accessPayload;
}

export function isProduction(env) {
  return ["prod", "production"].includes(cleanText(env.ENVIRONMENT).toLowerCase());
}

export function requireSameOrigin(request) {
  const origin = cleanText(request.headers.get("origin"));
  if (!origin) return;
  const expected = new URL(request.url).origin;
  if (origin !== expected) {
    throw httpError("Cross-origin requests are not allowed.", 403);
  }
}

export function cleanText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export function nullableText(value) {
  const text = cleanText(value);
  return text || null;
}

export function nullableInt(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? number : null;
}

export function nullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function boolToInt(value) {
  if (value === true || value === 1 || value === "1") return 1;
  if (value === false || value === 0 || value === "0") return 0;
  return null;
}

function base64Url(bytes) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function hexFromBuffer(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function randomToken(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

export async function sha256Hex(value) {
  const encoded = new TextEncoder().encode(cleanText(value));
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return hexFromBuffer(digest);
}

export function constantTimeEqual(leftValue, rightValue) {
  const left = cleanText(leftValue);
  const right = cleanText(rightValue);
  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    diff |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return diff === 0;
}

export function sessionTokenFromRequest(request, body = {}) {
  return cleanText(request.headers.get("x-session-token")) || cleanText(body.session_token);
}

export async function requireSessionToken(request, body, session) {
  const expectedHash = cleanText(session?.session_token_hash);
  if (!expectedHash) {
    throw httpError("Session authorization is not configured.", 401);
  }
  const token = sessionTokenFromRequest(request, body);
  if (!token) {
    throw httpError("Session authorization is required.", 401);
  }
  const receivedHash = await sha256Hex(token);
  if (!constantTimeEqual(receivedHash, expectedHash)) {
    throw httpError("Session authorization failed.", 401);
  }
}

export function requireProlificIdentity(client, env) {
  if (!isProduction(env)) return;
  if (client.prolific_pid && client.prolific_study_id && client.prolific_session_id) return;
  throw httpError("PROLIFIC_PID, STUDY_ID, and SESSION_ID are required in production.", 400);
}

export function isDryRunClient(client = {}) {
  return cleanText(client.prolific_study_id).toUpperCase() === "DRY_RUN";
}

export function isDryRunSession(session = {}) {
  return (
    isDryRunClient(session) ||
    cleanText(session.participant_key).toLowerCase().startsWith("dry-run:")
  );
}

export function assertTextMax(name, value, maxLength) {
  if (cleanText(value).length > maxLength) {
    throw httpError(`${name} is too long.`, 400);
  }
}

export function intInRange(value, min, max) {
  const number = nullableInt(value);
  return number !== null && number >= min && number <= max;
}

export function assertOptionalIntRange(name, value, min, max) {
  if (value === null || value === undefined || value === "") return;
  if (!intInRange(value, min, max)) {
    throw httpError(`${name} must be between ${min} and ${max}.`, 400);
  }
}

export function assertRequiredIntRange(name, value, min, max) {
  if (!intInRange(value, min, max)) {
    throw httpError(`${name} must be between ${min} and ${max}.`, 400);
  }
}

export function assertAllowed(name, value, allowedValues) {
  const text = cleanText(value);
  if (!allowedValues.includes(text)) {
    throw httpError(`${name} is not allowed.`, 400);
  }
}

export function minCompletionSeconds(env) {
  const configured = nullableInt(env.MIN_COMPLETION_SECONDS);
  return configured && configured > 0 ? configured : 0;
}

export function elapsedSeconds(startedAt, completedAt = nowIso()) {
  const startMs = Date.parse(startedAt);
  const endMs = Date.parse(completedAt);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  return Math.max(0, Math.round((endMs - startMs) / 1000));
}

export function prolificCompletionConfig(env) {
  const configuredUrl = cleanText(env.PROLIFIC_COMPLETION_URL);
  const code = cleanText(env.PROLIFIC_COMPLETION_CODE || env.PROLIFIC_CODE);
  return {
    code,
    url: configuredUrl || (code
      ? `https://app.prolific.com/submissions/complete?cc=${encodeURIComponent(code)}`
      : ""),
  };
}

export async function verifyTurnstile(request, env, token) {
  const secret = cleanText(env.TURNSTILE_SECRET_KEY);
  const required = cleanText(env.REQUIRE_TURNSTILE) === "1";
  if (!secret && required) {
    throw httpError("Turnstile is required but not configured.", 500);
  }
  if (!secret) return false;
  const cleanedToken = cleanText(token);
  if (!cleanedToken) {
    if (required) throw httpError("Turnstile token is required.", 400);
    return false;
  }

  const form = new FormData();
  form.append("secret", secret);
  form.append("response", cleanedToken);
  const ip = cleanText(request.headers.get("cf-connecting-ip"));
  if (ip) form.append("remoteip", ip);

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form,
  });
  const result = await response.json().catch(() => ({}));
  if (!result.success && required) {
    throw httpError("Turnstile verification failed.", 400);
  }
  return Boolean(result.success);
}

export function csvCell(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function rowsToCsv(rows, columns) {
  const header = columns.map(csvCell).join(",");
  const body = rows.map((row) => columns.map((key) => csvCell(row[key])).join(","));
  return [header, ...body].join("\n");
}

export function safeJson(value) {
  try {
    return JSON.stringify(value ?? null);
  } catch (error) {
    return JSON.stringify({ serialization_error: String(error?.message || error) });
  }
}

export async function insertEvent(db, event) {
  const id = crypto.randomUUID();
  const receivedAt = nowIso();
  await db
    .prepare(
      `INSERT INTO event_logs (
        id, session_id, rater_id, event_type, trial_index, event_at,
        server_received_at, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      nullableText(event.session_id),
      nullableText(event.rater_id),
      cleanText(event.event_type) || "event",
      nullableInt(event.trial_index),
      nullableText(event.event_at) || receivedAt,
      receivedAt,
      safeJson(event.payload || {}),
    )
    .run();
  return id;
}

export function requestClientContext(request, body = {}) {
  const url = new URL(request.url);
  return {
    dry_run:
      cleanText(body.dry_run) || cleanText(url.searchParams.get("dry_run")),
    prolific_pid:
      cleanText(body.prolific_pid) || cleanText(url.searchParams.get("PROLIFIC_PID")),
    prolific_study_id:
      cleanText(body.prolific_study_id) || cleanText(url.searchParams.get("STUDY_ID")),
    prolific_session_id:
      cleanText(body.prolific_session_id) ||
      cleanText(url.searchParams.get("SESSION_ID")),
    user_agent: request.headers.get("user-agent") || "",
  };
}
