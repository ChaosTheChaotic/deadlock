import { initTRPC, TRPCError } from "@trpc/server";
import type { Request, Response } from "express";
import { z } from "zod";
import * as Rapi from "./rlibs/index";

const emailSchema = z.email().min(3).max(255);
const passSchema = z.string().min(8);

const ACCESS_TOKEN_MAX_AGE = 15 * 60 * 1000; // 15 minutes
const REFRESH_TOKEN_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface Ctx {
  token?: string;
  refreshToken?: string;
  req: Request;
  res: Response;
  user?: { uid: string; email: string };
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
    const claimsJson = await Rapi.checkAccessJwt(ctx.token);
    const claims = JSON.parse(claimsJson) as { uid: string; email: string };

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
          uid: claims.uid,
          email: claims.email,
        },
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

// TODO: Implement rate limiting using redis
// The following line would .use(rateLimitMiddleware)
export const protectedProcedure: typeof t.procedure =
  t.procedure.use(authMiddleware);

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
	REFRESH_TOKEN_MAX_AGE
      );

      ctx.res.cookie("__Host-accessToken", accessToken, COOKIE_OPTS);
      ctx.res.cookie("__Host-refreshToken", refreshToken, {
        ...COOKIE_OPTS,
        maxAge: REFRESH_TOKEN_MAX_AGE,
      });

      return { user: { uid: usr.uid, email: usr.email } };
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
      const [refreshToken, jti] = await Rapi.genRefreshJwt(
        user.uid,
        user.email,
      );

      await Rapi.storeRefreshToken(
        jti,
        user.uid,
        user.email,
	REFRESH_TOKEN_MAX_AGE
      );

      // Set HTTP-only cookies
      if (ctx.res) {
        ctx.res.cookie("__Host-accessToken", accessToken, COOKIE_OPTS);

        ctx.res.cookie("__Host-refreshToken", refreshToken, {
          ...COOKIE_OPTS,
          maxAge: REFRESH_TOKEN_MAX_AGE,
        });
      }

      return {
        user: {
          uid: user.uid,
          email: user.email,
        },
      };
    }),

  refresh: t.procedure.mutation(async ({ ctx }) => {
    const refreshToken = ctx.refreshToken;
    if (!refreshToken) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "No refresh token provided",
      });
    }

    try {
      const claimsJson = await Rapi.checkRefreshJwt(refreshToken);
      const claims = JSON.parse(claimsJson) as {
        jti: string;
        uid: string;
        email: string;
      };

      const isValid = await Rapi.validateRefreshToken(claims.jti);
      if (!isValid) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid or expired refresh token",
        });
      }

      // Get the stored token data to ensure it matches
      const storedToken = await Rapi.getRefreshToken(claims.jti);
      if (!storedToken || storedToken.userId !== claims.uid) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid refresh token",
        });
      }

      const newAccessToken = await Rapi.genAccessJwt(claims.uid, claims.email);
      const [newRefreshToken, newJti] = await Rapi.genRefreshJwt(
        claims.uid,
        claims.email,
      );

      await Rapi.storeRefreshToken(
        newJti,
        claims.uid,
        claims.email,
	REFRESH_TOKEN_MAX_AGE
      );

      await Rapi.deleteRefreshToken(claims.jti);

      ctx.res.cookie("__Host-accessToken", newAccessToken, COOKIE_OPTS);
      ctx.res.cookie("__Host-refreshToken", newRefreshToken, {
        ...COOKIE_OPTS,
        maxAge: REFRESH_TOKEN_MAX_AGE,
      });

      return { user: { uid: claims.uid, email: claims.email } };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Failed to refresh token",
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

  me: protectedProcedure.query(({ ctx }) => {
    return {
      user: ctx.user,
    };
  }),
});

export type AppRouter = typeof appRouter;
