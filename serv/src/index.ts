import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter, Ctx, logEmitter } from "./trpc";
import oauthRouter from "./oauth";
import path from "path";
import { initDbs, initPanicLogging, initRedis, uidLookup } from "./rlibs";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import {
  cleanupExpiredTokens,
  cleanupRateLimitKeys,
  checkAccessJwt,
  initLogger,
} from "./rlibs/index";

const app = express();
const port = process.env.PORT ?? 8888;

const cdp = path.join(__dirname, "../../web/dist");
app.use(express.static(cdp));
app.use(express.json());
app.use(helmet());

const SECRET = process.env.COOKIE_SECRET ?? "stupid";
app.use(cookieParser(SECRET));

app.use(oauthRouter);

app.use(
  "/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext: async ({ req, res }): Promise<Ctx> => {
      const signedCookies = req.signedCookies as Record<
        string,
        string | undefined
      >;
      const token = signedCookies["__Host-accessToken"];
      let user;

      if (token) {
        try {
          const jwtData = await checkAccessJwt(token);

          if (jwtData.uid) {
            user = await uidLookup(jwtData.uid);
          }
        } catch (e) {
          console.error("Token validation failed", e);
        }
      }

      return { token, req, res, user, ip: req.ip };
    },
  }),
);

app.use((_, res, next) => {
  res.setHeader(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains",
  );
  next();
});

app.get(/^\/(?!trpc).*/, (_, res) => {
  res.sendFile(path.join(cdp, "index.html"));
});

async function initializeScheduledCleanups() {
  const CLEANUP_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

  async function runCleanup() {
    try {
      console.log("Running scheduled cleanup...");

      // Clean up expired rate limit keys
      const rateLimitCleaned = await cleanupRateLimitKeys();
      console.log(`Cleaned up ${rateLimitCleaned} rate limit keys`);

      const tokenCleaned = await cleanupExpiredTokens();
      console.log(`Cleaned up ${tokenCleaned} expired refresh tokens`);
    } catch (error) {
      console.error("Cleanup failed:", error);
    }
  }

  await runCleanup();

  // Schedule periodic cleanup
  setInterval(() => {
    runCleanup().catch((error) => {
      console.error("Cleanup failed:", error);
    });
  }, CLEANUP_INTERVAL_MS);
  console.log(`Scheduled cleanup every ${CLEANUP_INTERVAL_MS / 60000} minutes`);
}

async function initializeServer() {
  const logDbPath = path.resolve(__dirname, "../../db/logs/logs.sqlite");
  await initLogger(logDbPath, (err, payload) => {
    if (err) {
      console.error("Logger callback error:", err);
      return;
    }
    logEmitter.emit("new_log", payload);
  });
  await initPanicLogging();
  try {
    console.log("Initializing database pools...");
    await initDbs();
    console.log("Database pools initialized successfully");
    await initRedis();
    console.log("Redis initialized successfully");

    app.listen(port, () => {
      console.log(`Server listening on port ${port}`);
      console.log(`Frontend served from: ${cdp}`);
      console.log(`http://localhost:${port}`);
    });

    await initializeScheduledCleanups();
  } catch (error) {
    console.error("Failed to initialize database pools:", error);
    process.exit(1);
  }
}

void initializeServer();
