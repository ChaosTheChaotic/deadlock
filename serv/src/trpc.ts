import { initTRPC, TRPCError } from "@trpc/server";
import type { CreateNextContextOptions } from "@trpc/server/adapters/next";
import { z } from "zod";
import * as Rapi from "./rlibs/index";

const emailSchema = z.email().min(3).max(255);
const passSchema = z.string().min(8);

const ACCESS_TOKEN_MAX_AGE = 15 * 60 * 1000; // 15 minutes
const REFRESH_TOKEN_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days

export const createCtx = (opts: CreateNextContextOptions) => {
  const { req, res } = opts;

  const cookies = req.cookies || {};
  const token = cookies.accessToken;

  const refreshToken = cookies.refreshToken;

  return {
    token,
    refreshToken,
    req,
    res,
  };
};

export type Ctx = ReturnType<typeof createCtx> & {
  user?: { uid: string; email: string };
};

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

const authMiddleware = t.middleware(async ({ ctx, next, path }) => {
  // Skip auth for login/register/refresh endpoints
  if (["login", "register", "refresh"].includes(path)) {
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
    const claimsJson = await Rapi.checkAccessJwt(ctx.token);
    let claims: Record<string, unknown>;

    try {
      claims = JSON.parse(claimsJson) as Record<string, unknown>;
    } catch {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Invalid token format",
        cause: "INVALID_TOKEN_FORMAT",
      });
    }

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
        user: {
          uid: claims.uid as string,
          email: claims.email as string,
        },
      },
    });
  } catch (error) {
    if (error instanceof TRPCError) {
      throw error;
    }

    const message =
      error instanceof Error
        ? error.message.includes("expired")
          ? "Token has expired"
          : error.message
        : "Invalid token";

    throw new TRPCError({
      code: "UNAUTHORIZED",
      message,
      cause: "TOKEN_VERIFICATION_FAILED",
    });
  }
});
// TODO: Implement rate limiting using redis
// The following line would .use(rateLimitMiddleware)
export const protectedProcedure = t.procedure.use(authMiddleware);

// TODO: Convert this to redis
const refreshTokenStore = new Map<
  string,
  {
    userId: string;
    email: string;
    jti: string;
    expiresAt: Date;
  }
>();

export const appRouter = t.router({
  searchUsers: protectedProcedure
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
    .input(z.object({ email: z.email() }))
    .mutation(async ({ input }) => {
      return await Rapi.deleteUser(input.email);
    }),
  login: t.procedure
    .input(
      z.object({
        email: emailSchema,
        pass: passSchema,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const isValid = await Rapi.checkPass(input.email, input.pass);
      if (!isValid) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid email or password",
          cause: "INVALID_CREDENTIALS",
        });
      }

      const usrs = await Rapi.searchUsers(input.email);
      if (usrs.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
          cause: "USER_NOT_FOUND",
        });
      }

      const usr = usrs[0];
      const accessToken = await Rapi.genAccessJwt(usr.uid, usr.email);
      const [refreshToken, jti] = await Rapi.genRefreshJwt(usr.uid, usr.email);

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      refreshTokenStore.set(jti, {
        userId: usr.uid,
        email: usr.email,
        jti,
        expiresAt,
      });

      // Set HTTP-only cookies
      if (ctx.res) {
        ctx.res.setHeader("Set-Cookie", [
          `__Host-accessToken=${accessToken}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${ACCESS_TOKEN_MAX_AGE}; Priority=High; Signed`,
          `__Host-refreshToken=${refreshToken}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${REFRESH_TOKEN_MAX_AGE}; Priority=High; Signed`,
        ]);
      }

      return {
        user: {
          uid: usr.uid,
          email: usr.email,
        },
      };
    }),

  register: t.procedure
    .input(
      z.object({
        email: emailSchema,
        pass: passSchema.optional(),
        oauthProvider: z.string().optional(),
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
        input.oauthProvider,
      );

      const accessToken = await Rapi.genAccessJwt(user.uid, user.email);
      const [refreshToken, jti] = await Rapi.genRefreshJwt(user.uid, user.email);

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      refreshTokenStore.set(jti, {
        userId: user.uid,
        email: user.email,
        jti,
        expiresAt,
      });

      // Set HTTP-only cookies
      if (ctx.res) {
        ctx.res.setHeader("Set-Cookie", [
          `__Host-accessToken=${accessToken}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${ACCESS_TOKEN_MAX_AGE}; Priority=High; Signed`,
          `__Host-refreshToken=${refreshToken}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${REFRESH_TOKEN_MAX_AGE}; Priority=High; Signed`,
        ]);
      }

      return {
        user: {
          uid: user.uid,
          email: user.email,
        },
      };
    }),

  refresh: t.procedure
    .mutation(async ({ ctx }) => {
      const refreshToken = ctx.refreshToken;
      
      if (!refreshToken) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "No refresh token provided",
          cause: "NO_REFRESH_TOKEN",
        });
      }

      try {
        const claimsJson = await Rapi.checkRefreshJwt(refreshToken);
        const claims = JSON.parse(claimsJson) as { jti: string; uid: string; email: string };

        // Check if refresh token is valid in store
        const storedToken = refreshTokenStore.get(claims.jti);
        if (!storedToken || storedToken.userId !== claims.uid) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Invalid refresh token",
            cause: "INVALID_REFRESH_TOKEN",
          });
        }

        // Check if refresh token is expired
        if (storedToken.expiresAt < new Date()) {
          refreshTokenStore.delete(claims.jti);
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Refresh token expired",
            cause: "REFRESH_TOKEN_EXPIRED",
          });
        }

        // Generate new tokens
        const newAccessToken = await Rapi.genAccessJwt(claims.uid, claims.email);
        const [newRefreshToken, newJti] = await Rapi.genRefreshJwt(claims.uid, claims.email);

        // Update store
        refreshTokenStore.delete(claims.jti);
        
        const newExpiresAt = new Date();
        newExpiresAt.setDate(newExpiresAt.getDate() + 30);
        
        refreshTokenStore.set(newJti, {
          userId: claims.uid,
          email: claims.email,
          jti: newJti,
          expiresAt: newExpiresAt,
        });

        // Set new HTTP-only cookies
        if (ctx.res) {
          ctx.res.setHeader("Set-Cookie", [
            `__Host-accessToken=${newAccessToken}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${ACCESS_TOKEN_MAX_AGE}; Priority=High; Signed`,
            `__Host-refreshToken=${newRefreshToken}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${REFRESH_TOKEN_MAX_AGE}; Priority=High; Signed`,
          ]);
        }

        return {
          user: {
            uid: claims.uid,
            email: claims.email,
          },
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Failed to refresh token",
          cause: "REFRESH_FAILED",
        });
      }
    }),

  logout: t.procedure
    .input(z.object({ jti: z.string().optional() }).optional())
    .mutation(async ({ ctx, input }) => {
      const refreshToken = ctx.refreshToken;
      
      if (refreshToken) {
        try {
          const claimsJson = await Rapi.checkRefreshJwt(refreshToken);
          const claims = JSON.parse(claimsJson) as { jti: string };
          
          // Remove from store
          refreshTokenStore.delete(claims.jti);
        } catch {
          // Token is invalid, continue with logout
        }
      } else if (input?.jti) {
        // Fallback to input jti if no cookie
        refreshTokenStore.delete(input.jti);
      }

      // Clear cookies
      if (ctx.res) {
        ctx.res.setHeader("Set-Cookie", [
          "__Host-accessToken=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0",
          "__Host-refreshToken=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0",
        ]);
      }

      return { success: true };
    }),

  me: protectedProcedure
    .query(async ({ ctx }) => {
      return {
        user: ctx.user,
      };
    }),
});

export type AppRouter = typeof appRouter;
