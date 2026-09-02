function readEnv(key: string, fallback = ""): string {
  return process.env[key] ?? fallback;
}

const jwtSecret = readEnv("JWT_SECRET");

if (process.env.NODE_ENV === "production" && jwtSecret.length < 32) {
  throw new Error(
    "[env] JWT_SECRET is required in production and must be at least 32 characters. " +
      "Generate one with: node -e \"console.log(require('crypto').randomBytes(48).toString('base64url'))\"",
  );
}

const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter((o) => o.length > 0);

if (process.env.NODE_ENV === "production" && allowedOrigins.length === 0) {
  console.warn(
    "[env] CORS_ALLOWED_ORIGINS is empty in production. All cross-origin requests will be denied.",
  );
}

export const ENV = {
  appId: readEnv("VITE_APP_ID"),
  cookieSecret: jwtSecret,
  databaseUrl: readEnv("DATABASE_URL"),
  oAuthServerUrl: readEnv("OAUTH_SERVER_URL"),
  ownerOpenId: readEnv("OWNER_OPEN_ID"),
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: readEnv("BUILT_IN_FORGE_API_URL"),
  forgeApiKey: readEnv("BUILT_IN_FORGE_API_KEY"),
  allowedOrigins,
};
