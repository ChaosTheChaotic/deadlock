import express from "express";
import { OAuth2Client } from "google-auth-library";
import { URLSearchParams } from "url";
import * as Rapi from "./rlibs/index";

const router: ReturnType<typeof express.Router> = express.Router();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const GOOGLE_CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL || "";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

const oauth2Client = new OAuth2Client(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_CALLBACK_URL
);

const ACCESS_TOKEN_MAX_AGE = 15 * 60 * 1000;
const REFRESH_TOKEN_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  signed: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: ACCESS_TOKEN_MAX_AGE,
  priority: "high" as const,
};

router.get("/auth/google", (req, res) => {
  const redirectUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: [
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
    ],
    prompt: "select_account",
    state: req.query.redirect_uri as string || "/", // Store where to redirect after auth
  });
  
  res.redirect(redirectUrl);
});

router.get("/auth/google/callback", async (req, res) => {
  try {
    const { code, state } = req.query;
    
    if (!code || typeof code !== "string") {
      throw new Error("No authorization code received");
    }

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Get user info from Google
    const ticket = await oauth2Client.verifyIdToken({
      idToken: tokens.id_token!,
      audience: GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload) {
      throw new Error("Failed to get user payload");
    }

    const email = payload.email!;
    const googleId = payload.sub;
    const name = payload.name || "";

    // Check if user exists by OAuth ID
    const existingUsers = await Rapi.searchUsers(email);
    let user;

    if (existingUsers.length > 0) {
      // User exists by email, check if they have Google OAuth
      const existingUser = existingUsers[0];
      
      if (existingUser.oauthProvider === "google" && 
          existingUser.oauthProviderId === googleId) {
        // Exact match, use existing user
        user = existingUser;
      } else if (!existingUser.oauthProvider && !existingUser.oauthProviderId) {
        // User exists with password, link Google account using updateUser
        user = await Rapi.updateUser(email, undefined, "google", googleId);
        console.log(`Linked Google account to existing user: ${email}`);
      } else {
        // User exists with different OAuth provider
        throw new Error("Account already exists with different authentication method");
      }
    } else {
      // Create new user with Google OAuth
      user = await Rapi.createUser(email, undefined, "google", googleId);
    }

    // Generate JWT tokens
    const accessToken = await Rapi.genAccessJwt(user.uid, user.email);
    const [refreshToken, jti] = await Rapi.genRefreshJwt(user.uid, user.email);

    await Rapi.storeRefreshToken(
      jti,
      user.uid,
      user.email,
      REFRESH_TOKEN_MAX_AGE
    );

    // Set HTTP-only cookies
    res.cookie("__Host-accessToken", accessToken, COOKIE_OPTS);
    res.cookie("__Host-refreshToken", refreshToken, {
      ...COOKIE_OPTS,
      maxAge: REFRESH_TOKEN_MAX_AGE,
    });

    // Redirect to frontend with success state
    const redirectTo = typeof state === "string" ? state : "/";
    const params = new URLSearchParams({
      success: "true",
      email: encodeURIComponent(email),
      name: encodeURIComponent(name),
    });
    
    res.redirect(`${FRONTEND_URL}${redirectTo}?${params.toString()}`);
  } catch (error) {
    console.error("Google OAuth callback error:", error);
    
    // Redirect to frontend with error
    const params = new URLSearchParams({
      error: "oauth_failed",
      message: error instanceof Error ? encodeURIComponent(error.message) : "Authentication failed",
    });
    
    res.redirect(`${FRONTEND_URL}/login?${params.toString()}`);
  }
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
    const claims = JSON.parse(claimsJson);
    res.json({ authenticated: true, user: claims });
  } catch {
    res.json({ authenticated: false });
  }
});

export default router;
