import express from "express";
import { OAuth2Client } from "google-auth-library";
import { URLSearchParams } from "url";
import * as Rapi from "./rlibs/index";

interface OAuthState {
  redirect_uri?: string;
  frontend_origin?: string;
  timestamp?: number;
  nonce?: string;
}

const router: ReturnType<typeof express.Router> = express.Router();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? "";

const ALLOWED_ORIGINS = (
  process.env.ALLOWED_ORIGINS ?? "http://localhost:8888"
).split(",");
const ALLOWED_REDIRECT_PATHS = (
  process.env.ALLOWED_REDIRECT_PATHS ?? "/"
).split(",");
const DEFAULT_URL =
  process.env.DEFAULT_URL ?? "http://localhost:8888";

const getHeader = (val: string | string[] | undefined): string | undefined =>
  Array.isArray(val) ? val[0] : val;

const getServerUrl = (req: express.Request): string => {
  const protocol =
    getHeader(req.headers["x-forwarded-proto"]) ?? req.protocol ?? "http";
  const host =
    getHeader(req.headers["x-forwarded-host"]) ??
    req.headers.host ??
    "localhost:8888";
  return `${protocol}://${host}`;
};

// Get frontend URL from request or use default
const getFrontendUrl = (req: express.Request): string => {
  const origin = req.headers.origin!;
  const referer = req.headers.referer!;

  // Check if origin is allowed
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    return origin;
  }

  // Extract origin from referer
  if (referer) {
    try {
      const url = new URL(referer);
      const refererOrigin = url.origin;
      if (ALLOWED_ORIGINS.includes(refererOrigin)) {
        return refererOrigin;
      }
    } catch {
      // Invalid URL, fall through
    }
  }

  return DEFAULT_URL;
};

// Validate redirect path
const validateRedirectPath = (path: string): string => {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  if (ALLOWED_REDIRECT_PATHS.includes(cleanPath)) return cleanPath;

  for (const allowedPath of ALLOWED_REDIRECT_PATHS) {
    if (allowedPath.includes("*")) {
      const pattern = new RegExp(`^${allowedPath.replace("*", ".*")}$`);
      if (pattern.test(cleanPath)) return cleanPath;
    }
  }
  return "/";
};

const ACCESS_TOKEN_MAX_AGE = 15 * 60 * 1000;
const REFRESH_TOKEN_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

const COOKIE_OPTS = {
  httpOnly: true,
  secure: true,
  signed: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: ACCESS_TOKEN_MAX_AGE,
  priority: "high" as const,
};

const createOAuth2Client = (callbackUrl: string) => {
  return new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, callbackUrl);
};

router.get("/auth/google", (req, res) => {
  try {
    const frontendUrl = getFrontendUrl(req);
    const backendUrl = getServerUrl(req);
    const callbackUrl = `${backendUrl}/auth/google/callback`;
    const oauth2Client = createOAuth2Client(callbackUrl);

    const redirectPath = (req.query.redirect_uri as string) ?? "/";
    const validatedPath = validateRedirectPath(redirectPath);

    const statePayload: OAuthState = {
      redirect_uri: validatedPath,
      frontend_origin: frontendUrl,
      timestamp: Date.now(),
      nonce: Math.random().toString(36).substring(2),
    };

    const redirectUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: [
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile",
      ],
      prompt: "select_account",
      state: JSON.stringify(statePayload),
    });

    console.warn(
      `OAuth initiated: frontend=${frontendUrl}, callback=${callbackUrl}`,
    );
    res.redirect(redirectUrl);
  } catch (error) {
    console.error("OAuth initiation error:", error);
    res.redirect(`${DEFAULT_URL}/login?error=oauth_init_failed`);
  }
});

router.get("/auth/google/callback", async (req, res) => {
  try {
    const { code, state } = req.query;

    if (!code || typeof code !== "string")
      throw new Error("No authorization code received");

    let stateObj: OAuthState;
    try {
      stateObj = state ? (JSON.parse(state as string) as OAuthState) : {};
    } catch {
      stateObj = {};
    }

    const frontendOrigin = stateObj.frontend_origin ?? DEFAULT_URL;
    const redirectPath = stateObj.redirect_uri ?? "/";

    // Validate frontend origin
    if (!ALLOWED_ORIGINS.includes(frontendOrigin)) {
      throw new Error(`Unauthorized frontend origin: ${frontendOrigin}`);
    }

    const backendUrl = getServerUrl(req);
    const callbackUrl = `${backendUrl}/auth/google/callback`;
    const oauth2Client = createOAuth2Client(callbackUrl);

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Get user info from Google
    const ticket = await oauth2Client.verifyIdToken({
      idToken: tokens.id_token ?? "",
      audience: GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload) throw new Error("Failed to get user payload");

    const email = payload.email ?? "";
    const googleId = payload.sub;
    const name = payload.name ?? "";

    // Check if user exists by OAuth ID
    const existingUsers = await Rapi.searchUsers(email);
    let user;

    if (existingUsers.length > 0) {
      const existingUser = existingUsers[0];

      if (
        existingUser.oauthProvider === "google" &&
        existingUser.oauthProviderId === googleId
      ) {
        user = existingUser;
      } else if (!existingUser.oauthProvider && !existingUser.oauthProviderId) {
        user = await Rapi.updateUser(email, undefined, "google", googleId);
        console.log(`Linked Google account to existing user: ${email}`);
      } else {
        throw new Error(
          "Account already exists with different authentication method",
        );
      }
    } else {
      user = await Rapi.createUser(email, undefined, "google", googleId);
    }

    // Generate JWT tokens
    const accessToken = await Rapi.genAccessJwt(user.uid, user.email);
    const [refreshToken, jti] = await Rapi.genRefreshJwt(user.uid, user.email);

    await Rapi.storeRefreshToken(
      jti,
      user.uid,
      user.email,
      REFRESH_TOKEN_MAX_AGE,
    );

    // Set HTTP-only cookies
    res.cookie("__Host-accessToken", accessToken, COOKIE_OPTS);
    res.cookie("__Host-refreshToken", refreshToken, {
      ...COOKIE_OPTS,
      maxAge: REFRESH_TOKEN_MAX_AGE,
    });

    // Redirect to frontend with success
    const params = new URLSearchParams({
      success: "true",
      email: encodeURIComponent(email),
      name: encodeURIComponent(name),
    });

    res.redirect(`${frontendOrigin}${redirectPath}?${params.toString()}`);
  } catch (error) {
    console.error("Google OAuth callback error:", error);

    // Redirect to default frontend on error
    const params = new URLSearchParams({
      error: "oauth_failed",
      message:
        error instanceof Error
          ? encodeURIComponent(error.message)
          : "Authentication failed",
    });

    res.redirect(`${DEFAULT_URL}/login?${params.toString()}`);
  }
});

router.get("/auth/config", (req, res) => {
  const backendUrl = getServerUrl(req);
  const frontendUrl = getFrontendUrl(req);

  res.json({
    googleClientId: GOOGLE_CLIENT_ID ? "configured" : "not_configured",
    allowedOrigins: ALLOWED_ORIGINS,
    backendUrl,
    frontendUrl,
    callbackUrl: `${backendUrl}/auth/google/callback`,
    hasGoogleConfig: !!GOOGLE_CLIENT_ID && !!GOOGLE_CLIENT_SECRET,
  });
});

// Get OAuth status
router.get("/auth/status", async (req, res) => {
  const signedCookies = req.signedCookies as Record<string, string | undefined>;
  const token = signedCookies["__Host-accessToken"];

  if (!token) {
    return res.json({ authenticated: false });
  }

  try {
    const claimsJson = await Rapi.checkAccessJwt(token);
    const claims = JSON.parse(claimsJson) as Rapi.RefreshTokenClaims;
    res.json({ authenticated: true, user: claims });
  } catch {
    res.json({ authenticated: false });
  }
});

// CORS middleware for OAuth endpoints
router.use("/auth", (req, res, next) => {
  const origin = req.headers.origin!;

  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  }

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});

export default router;
