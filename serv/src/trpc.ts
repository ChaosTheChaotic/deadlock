import { initTRPC, TRPCError } from "@trpc/server";
import type { Request, Response } from "express";
import { z } from "zod";
import { on, EventEmitter } from "events";
import * as Rapi from "./rlibs/index";
import path from "path";

const emailSchema = z.email().min(3).max(255);
const passSchema = z.string().min(8);

const ACCESS_TOKEN_MAX_AGE = 15 * 60 * 1000; // 15 minutes
const REFRESH_TOKEN_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days

export const logEmitter = new EventEmitter();

export interface Ctx {
  token?: string;
  refreshToken?: string;
  req: Request;
  res: Response;
  user?: {
    uid: string;
    email: string;
    roles: string[];
    perms: string[];
  };
  ip?: string;
}

export const t = initTRPC.context<Ctx>().create({
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.code === "BAD_REQUEST" && error.cause instanceof Error
            ? error.cause
            : null,
      },
    };
  },
});

const PERM_MAP: Record<string, string[]> = {
  "users:manage": [
    "users:create",
    "users:edit",
    "users:delete",
    "users:search",
  ],
  "admin:access": ["users:manage"],
};

function hasEffectivePerm(userPerms: string[], required: string): boolean {
  if (userPerms.includes(required)) return true;

  return Object.entries(PERM_MAP).some(
    ([parent, children]) =>
      userPerms.includes(parent) && children.includes(required),
  );
}

const checkPerms = (required: string) =>
  t.middleware(async ({ ctx, next }) => {
    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }

    if (!hasEffectivePerm(ctx.user.perms, required)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Missing permission: ${required}`,
      });
    }

    return next({ ctx });
  });

const authMiddleware = t.middleware(async ({ ctx, next, path }) => {
  if (["login", "register", "refresh", "logout"].includes(path)) {
    return next({ ctx });
  }

  if (!ctx.token) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Missing authentication token",
      cause: "NO_TOKEN",
    });
  }

  try {
    const claims = await Rapi.checkAccessJwt(ctx.token);

    // Fetch the full user for all roles/perms access
    const usrs = await Rapi.searchUsers(claims.email);
    if (usrs.length === 0) throw new Error("User no longer exists");
    const fullUser = usrs[0];

    if (!claims.uid || !claims.email) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Invalid token claims",
        cause: "INVALID_CLAIMS",
      });
    }

    return next({
      ctx: {
        ...ctx,
        user: fullUser,
      },
    });
  } catch (error) {
    if (error instanceof TRPCError) throw error;

    const message =
      error instanceof Error && error.message.includes("expired")
        ? "Token has expired"
        : "Invalid token";

    throw new TRPCError({
      code: "UNAUTHORIZED",
      message,
      cause: "TOKEN_VERIFICATION_FAILED",
    });
  }
});

const createRateLimitMiddleware = (config: {
  maxRequests: number;
  windowSeconds: number;
  getIdentifier: (ctx: Ctx) => string;
}): ReturnType<typeof t.middleware> => {
  return t.middleware(async ({ ctx, next }) => {
    const identifier = config.getIdentifier(ctx);

    const [allowed, remainingSeconds, remainingRequests] =
      await Rapi.checkRateLimit(
        identifier,
        config.maxRequests,
        config.windowSeconds,
      );

    // Set rate limit headers for client information
    ctx.res.setHeader("X-RateLimit-Limit", config.maxRequests);
    ctx.res.setHeader("X-RateLimit-Remaining", remainingRequests);
    ctx.res.setHeader("X-RateLimit-Reset", remainingSeconds);

    if (!allowed) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `Rate limit exceeded. Try again in ${remainingSeconds} seconds.`,
        cause: "RATE_LIMIT_EXCEEDED",
      });
    }

    return next({ ctx });
  });
};

const errorLoggingMiddleware = t.middleware(
  async ({ ctx, path, type, next }) => {
    // Execute the procedure and wait for the result
    const result = await next();

    // Check if the procedure resulted in an error
    if (!result.ok) {
      const error = result.error;

      const userStr = ctx?.user
        ? `[User: ${ctx.user.email}]`
        : "[Unauthenticated]";

      const logMsg = `tRPC ${type} '${path}' failed ${userStr}: ${error.message}`;

      try {
        if (error.code === "INTERNAL_SERVER_ERROR") {
          await Rapi.writeLog("error", logMsg);
          console.error(error);
        } else {
          await Rapi.writeLog("warn", logMsg);
        }
      } catch (error) {
        console.error("Critical: Logging utility failed:", error);
      }
    }

    // Return the original result (error or success) to the client
    return result;
  },
);

// Create specific rate limit configurations
export const rateLimitMiddleware = {
  // For authenticated users: 100 requests per 15 minutes
  authenticated: createRateLimitMiddleware({
    maxRequests: 100,
    windowSeconds: 15 * 60, // 15 minutes
    getIdentifier: (ctx) => ctx.user?.uid ?? ctx.req.ip ?? "unknown",
  }),

  // For unauthenticated users: 10 requests per 15 minutes
  unauthenticated: createRateLimitMiddleware({
    maxRequests: 10,
    windowSeconds: 15 * 60,
    getIdentifier: (ctx) => ctx.req.ip ?? "unknown",
  }),

  // For login/register: 5 attempts per 5 minutes
  authEndpoint: createRateLimitMiddleware({
    maxRequests: 5,
    windowSeconds: 5 * 60, // 5 minutes
    getIdentifier: (ctx) => ctx.req.ip ?? "unknown",
  }),

  // Custom configurable rate limit
  custom: (config: {
    maxRequests: number;
    windowSeconds: number;
    getIdentifier: (ctx: Ctx) => string;
  }) => createRateLimitMiddleware(config),
};

export const baseProcedure: typeof t.procedure = t.procedure.use(
  errorLoggingMiddleware,
);

export const protectedProcedure: typeof t.procedure =
  baseProcedure.use(authMiddleware);

export const rateLimitedProcedure: typeof t.procedure = protectedProcedure.use(
  rateLimitMiddleware.authenticated,
);

const COOKIE_OPTS = {
  httpOnly: true,
  secure: true,
  signed: true,
  sameSite: "strict" as const,
  path: "/",
  maxAge: ACCESS_TOKEN_MAX_AGE,
  priority: "high" as const,
} as const;

export const appRouter = t.router({
  searchUsers: protectedProcedure
    .use(checkPerms("users:search"))
    .input(z.object({ email: z.string() }))
    .query(async ({ input }) => {
      return await Rapi.searchUsers(input.email);
    }),
  checkPass: protectedProcedure
    .input(z.object({ email: z.email(), pass: z.string() }))
    .query(async ({ input }) => {
      return await Rapi.checkPass(input.email, input.pass);
    }),
  addUser: protectedProcedure
    .use(checkPerms("users:create"))
    .input(
      z.object({
        email: z.email(),
        pass: z.string().optional(),
        oauthProvider: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      return await Rapi.createUser(
        input.email,
        input.pass,
        input.oauthProvider,
      );
    }),
  deleteUser: protectedProcedure
    .use(checkPerms("users:delete"))
    .input(z.object({ email: z.email() }))
    .mutation(async ({ input }) => {
      return await Rapi.deleteUser(input.email);
    }),
  login: baseProcedure
    .use(rateLimitMiddleware.authEndpoint)
    .input(z.object({ email: emailSchema, pass: passSchema }))
    .mutation(async ({ input, ctx }) => {
      const isValid = await Rapi.checkPass(input.email, input.pass);
      if (!isValid) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid email or password",
        });
      }

      const usrs = await Rapi.searchUsers(input.email);
      if (usrs.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      const usr = usrs[0];
      const accessToken = await Rapi.genAccessJwt(usr.uid, usr.email);
      const [refreshToken, jti] = await Rapi.genRefreshJwt(usr.uid, usr.email);

      await Rapi.storeRefreshToken(
        jti,
        usr.uid,
        usr.email,
        REFRESH_TOKEN_MAX_AGE,
      );

      ctx.res.cookie("__Host-accessToken", accessToken, COOKIE_OPTS);
      ctx.res.cookie("__Host-refreshToken", refreshToken, {
        ...COOKIE_OPTS,
        maxAge: REFRESH_TOKEN_MAX_AGE,
      });

      return { user: usr };
    }),

  register: baseProcedure
    .use(rateLimitMiddleware.authEndpoint)
    .input(
      z.object({
        email: emailSchema,
        pass: passSchema.optional(),
        roles: z.array(z.string()).optional(),
        perms: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const existingUsers = await Rapi.searchUsers(input.email);
      if (existingUsers.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "User already exists",
          cause: "USER_EXISTS",
        });
      }

      const user = await Rapi.createUser(
        input.email,
        input.pass,
        null,
        null,
        input.roles,
        input.perms,
      );

      const accessToken = await Rapi.genAccessJwt(user.uid, user.email);
      const [refreshToken, jti] = await Rapi.genRefreshJwt(
        user.uid,
        user.email,
      );

      await Rapi.storeRefreshToken(
        jti,
        user.uid,
        user.email,
        REFRESH_TOKEN_MAX_AGE,
      );

      // Set HTTP-only cookies
      if (ctx.res) {
        ctx.res.cookie("__Host-accessToken", accessToken, COOKIE_OPTS);

        ctx.res.cookie("__Host-refreshToken", refreshToken, {
          ...COOKIE_OPTS,
          maxAge: REFRESH_TOKEN_MAX_AGE,
        });
      }

      return { user };
    }),

  refresh: baseProcedure
    .use(rateLimitMiddleware.unauthenticated)
    .mutation(async ({ ctx }) => {
      const refreshToken = ctx.refreshToken;
      if (!refreshToken) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "No refresh token provided",
        });
      }

      try {
        const claims = await Rapi.checkRefreshJwt(refreshToken);

        const isValid = await Rapi.validateRefreshToken(claims.jti);
        if (!isValid) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Invalid or expired refresh token",
          });
        }

        // Get the stored token data to ensure it matches
        const storedToken = await Rapi.getRefreshToken(claims.jti);
        if (storedToken?.userId !== claims.uid) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Invalid refresh token",
          });
        }

        const newAccessToken = await Rapi.genAccessJwt(
          claims.uid,
          claims.email,
        );
        const [newRefreshToken, newJti] = await Rapi.genRefreshJwt(
          claims.uid,
          claims.email,
        );

        await Rapi.storeRefreshToken(
          newJti,
          claims.uid,
          claims.email,
          REFRESH_TOKEN_MAX_AGE,
        );

        await Rapi.deleteRefreshToken(claims.jti);

        ctx.res.cookie("__Host-accessToken", newAccessToken, COOKIE_OPTS);
        ctx.res.cookie("__Host-refreshToken", newRefreshToken, {
          ...COOKIE_OPTS,
          maxAge: REFRESH_TOKEN_MAX_AGE,
        });

        const usrs = await Rapi.searchUsers(claims.email);
        if (usrs.length === 0) throw new Error("User not found");
        const fullUser = usrs[0];

        return { user: fullUser, claims };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Failed to refresh token",
        });
      }
    }),

  logout: baseProcedure
    .input(z.object({ jti: z.string().optional() }).optional())
    .mutation(async ({ ctx, input }) => {
      const refreshToken = ctx.refreshToken;

      if (refreshToken) {
        try {
          const claims = await Rapi.checkRefreshJwt(refreshToken);
          await Rapi.deleteRefreshToken(claims.jti);
        } catch {
          /* ignore */
        }
      } else if (input?.jti) {
        await Rapi.deleteRefreshToken(input.jti);
      }

      ctx.res.clearCookie("__Host-accessToken", COOKIE_OPTS);
      ctx.res.clearCookie("__Host-refreshToken", COOKIE_OPTS);

      return { success: true };
    }),

  me: rateLimitedProcedure.query(({ ctx }) => {
    return {
      user: ctx.user,
    };
  }),
  rateLimitStats: protectedProcedure
    .input(z.object({ identifier: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const identifier =
        input.identifier ?? ctx.user?.uid ?? ctx.req.ip ?? "unknown";
      return await Rapi.getRateLimitStats(identifier);
    }),

  resetRateLimit: protectedProcedure
    .use(checkPerms("admin:access"))
    .input(z.object({ identifier: z.string() }))
    .mutation(async ({ input }) => {
      return await Rapi.resetRateLimit(input.identifier);
    }),
  cleanupRateLimits: protectedProcedure.mutation(async () => {
    const cleaned = await Rapi.cleanupRateLimitKeys();
    return { cleaned, success: true };
  }),

  runCleanup: protectedProcedure
    .use(checkPerms("admin:access"))
    .mutation(async () => {
      const rateLimitCleaned = await Rapi.cleanupRateLimitKeys();
      const tokenCleaned = await Rapi.cleanupExpiredTokens();
      return {
        rateLimitCleaned,
        tokenCleaned,
        totalCleaned: rateLimitCleaned + tokenCleaned,
        success: true,
      };
    }),
  updateUser: protectedProcedure
    .input(
      z.object({
        uid: z.string(),
        email: emailSchema.optional(),
        pass: passSchema.optional(),
        roles: z.array(z.string()).optional(),
        perms: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const isTargetUser = ctx.user?.uid === input.uid;
      const hasEditPermission = ctx.user
        ? hasEffectivePerm(ctx.user.perms, "users:edit")
        : false;

      if (!isTargetUser && !hasEditPermission) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "You can only modify your own account unless you have the right permissions.",
        });
      }

      // Only users with users:edit can change roles or permissions (prevent self-escalation)
      const isTryingToChangeAccess =
        (input.roles !== undefined && input.roles.length > 0) ||
        (input.perms !== undefined && input.perms.length > 0);

      if (isTryingToChangeAccess && !hasEditPermission) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have permission to assign roles or permissions.",
        });
      }
      return await Rapi.updateUser(
        input.uid,
        input.email,
        input.pass,
        null,
        null,
        input.roles,
        input.perms,
      );
    }),
  getLogs: protectedProcedure
    .use(checkPerms("admin:access"))
    .input(
      z.object({
        query: z.string().default(""),
        levels: z.array(z.string()).optional(),
        startTime: z.string().optional(),
        endTime: z.string().optional(),
        limit: z.number().default(100),
      }),
    )
    .query(async ({ input }) => {
      try {
        const logDbPath = path.resolve(__dirname, "../../db/logs/logs.sqlite");
        return await Rapi.getLogs(
          logDbPath,
          input.query,
          input.levels,
          input.startTime,
          input.endTime,
          input.limit,
        );
      } catch (e) {
        console.error("Log fetch failed:", e);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Log DB unreachable",
        });
      }
    }),
  logStream: protectedProcedure
    .use(checkPerms("admin:access"))
    .input(
      z.object({
        query: z.string().default(""),
        levels: z.array(z.string()).optional(),
      }),
    )
    .subscription(async function* ({ input, signal }) {
      const iterator = on(logEmitter, "new_log", { signal });

      const searchTerms = input.query
        .toLowerCase()
        .split(" ")
        .filter((t) => t.length > 0);

      for await (const [log] of iterator) {
        if (!log || typeof log !== "object" || !log.level) {
          console.error("Invalid log object found when emitting logs");
          continue;
        }
        // Level check
        if (input.levels?.length && !input.levels.includes(log.level)) continue;

        if (searchTerms.length > 0) {
          const msg = log.message.toLowerCase();
          const matches = searchTerms.every((term) => msg.includes(term));
          if (!matches) continue;
        }

        yield log;
      }
    }),
});

export type AppRouter = typeof appRouter;
