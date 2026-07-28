// Middleware de autenticación via Cloudflare Access
// En producción, valida el JWT de Cf-Access-Jwt-Assertion criptográficamente
// contra el JWKS público de Access (RS256), sin dependencias externas —
// solo Web Crypto nativo (disponible en el runtime de Workers).
// En desarrollo local (Miniflare), permite acceso sin header.

import type { Env } from "../index";

const JWKS_CACHE_KEY = "cf_access_jwks_cache";
const JWKS_CACHE_TTL_SECONDS = 3600;

interface AccessJwk {
  kid: string;
  kty: string;
  n: string;
  e: string;
}

interface Jwks {
  keys: AccessJwk[];
}

interface AccessClaims {
  email?: string;
  sub?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
}

function base64UrlToBase64(input: string): string {
  let b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4 !== 0) b64 += "=";
  return b64;
}

function base64UrlDecodeBytes(input: string): Uint8Array {
  const binary = atob(base64UrlToBase64(input));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64UrlDecodeJson(input: string): Record<string, unknown> {
  const text = new TextDecoder().decode(base64UrlDecodeBytes(input));
  return JSON.parse(text);
}

/**
 * Obtiene el JWKS de Cloudflare Access, cacheado en KV para no golpear la
 * red en cada request. El caché expira solo; la rotación de claves de
 * Access es infrecuente y esto evita una llamada externa por request.
 */
async function getJwks(env: Env): Promise<Jwks> {
  const cached = await env.STRATON_KV.get(JWKS_CACHE_KEY, "json");
  if (cached) return cached as Jwks;

  const teamDomain = env.CF_ACCESS_TEAM_DOMAIN;
  if (!teamDomain) {
    throw new Error("CF_ACCESS_TEAM_DOMAIN no está configurado");
  }

  const resp = await fetch(`https://${teamDomain}.cloudflareaccess.com/cdn-cgi/access/certs`);
  if (!resp.ok) {
    throw new Error(`No se pudo obtener el JWKS de Access: HTTP ${resp.status}`);
  }
  const jwks = (await resp.json()) as Jwks;

  await env.STRATON_KV.put(JWKS_CACHE_KEY, JSON.stringify(jwks), {
    expirationTtl: JWKS_CACHE_TTL_SECONDS,
  });

  return jwks;
}

/**
 * Verifica un JWT de Cloudflare Access:
 *   - Firma RS256 contra la clave pública correspondiente (por "kid") en el JWKS.
 *   - Claim "aud" coincide con CF_ACCESS_AUD.
 *   - "exp"/"nbf" vigentes.
 *   - "email" o "sub" presentes.
 * Devuelve los claims si es válido, o null si falla cualquier verificación.
 */
async function verifyAccessJwt(jwt: string, env: Env): Promise<AccessClaims | null> {
  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, signatureB64] = parts;

  let header: Record<string, unknown>;
  let payload: AccessClaims;
  try {
    header = base64UrlDecodeJson(headerB64);
    payload = base64UrlDecodeJson(payloadB64) as AccessClaims;
  } catch {
    return null;
  }

  const kid = header.kid as string | undefined;
  const alg = header.alg as string | undefined;
  if (!kid || alg !== "RS256") return null;

  const jwks = await getJwks(env);
  const jwk = jwks.keys.find((k) => k.kid === kid);
  if (!jwk) return null;

  const publicKey = await crypto.subtle.importKey(
    "jwk",
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );

  const signature = base64UrlDecodeBytes(signatureB64);
  const signedData = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const validSignature = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", publicKey, signature, signedData);
  if (!validSignature) return null;

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === "number" && payload.exp < now) return null;
  if (typeof payload.nbf === "number" && payload.nbf > now) return null;

  const expectedAud = env.CF_ACCESS_AUD;
  if (!expectedAud) return null;
  const audMatches = Array.isArray(payload.aud)
    ? payload.aud.includes(expectedAud)
    : payload.aud === expectedAud;
  if (!audMatches) return null;

  if (!payload.email && !payload.sub) return null;

  return payload;
}

/**
 * Valida el acceso a rutas protegidas.
 * Retorna true si:
 *   - env.ENVIRONMENT === "development" (bypass explícito de desarrollo
 *     local vía .dev.vars — NUNCA se infiere de la ausencia del header,
 *     porque eso es justo el hueco que esto corrige: si Access no está
 *     configurado sobre /api/* en producción, una request también llegaría
 *     sin header, y aceptarla igual sería el mismo problema de antes).
 *   - El header Cf-Access-Jwt-Assertion está presente y el JWT es
 *     criptográficamente válido (firma, aud, expiración).
 *
 * Retorna false en cualquier otro caso: header ausente en producción, JWT
 * presente pero inválido, o error verificando.
 */
export async function validateAccess(request: Request, env: Env): Promise<boolean> {
  // Bypass explícito solo en desarrollo local. Fail-safe: si ENVIRONMENT no
  // está seteado o vale otra cosa, NO se activa el bypass (se exige JWT).
  if (env.ENVIRONMENT === "development") {
    return true;
  }

  const jwt = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!jwt) {
    return false;
  }

  try {
    const claims = await verifyAccessJwt(jwt, env);
    return claims !== null;
  } catch (e) {
    console.error("Error verificando JWT de Access:", e);
    return false;
  }
}
