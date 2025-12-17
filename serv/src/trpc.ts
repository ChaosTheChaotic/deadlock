import { initTRPC, TRPCError } from "@trpc/server";
import type { CreateNextContextOptions } from "@trpc/server/adapters/next";
import { z } from "zod";
import * as Rapi from "./rlibs/index";

const emailSchema = z.email().min(3).max(255);
const passSchema = z.string().min(8);

function hasHeaders(obj: unknown): obj is { headers: Record<string, unknown> } {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "headers" in obj &&
    typeof (obj as Record<string, unknown>).headers === "object"
  );
}

export const createCtx = (opts: CreateNextContextOptions) => {
  const req = opts.req as unknown;
  let token: string | undefined;

  if (hasHeaders(req)) {
    const authHeader = req.headers.authorization;
    if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
      token = authHeader.slice(7).trim();
    }
  }

  return {
    token,
  };
};
export type Ctx = ReturnType<typeof createCtx>;

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

const authMiddleware = t.middleware(async ({ ctx, next }) => {
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

    // Additional validation
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
    .mutation(async ({ input }) => {
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
      expiresAt.setDate(expiresAt.getDate() + 30); // 30 days

      refreshTokenStore.set(jti, {
        userId: usr.uid,
        email: usr.email,
        jti,
        expiresAt,
      });

      return {
        accessToken,
        refreshToken,
        jti,
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
    .mutation(async ({ input }) => {
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

      // Store refresh token metadata
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      refreshTokenStore.set(jti, {
        userId: user.uid,
        email: user.email,
        jti,
        expiresAt,
      });

      return {
        accessToken,
        refreshToken,
        jti,
        user: {
          uid: user.uid,
          email: user.email,
        },
      };
    }),

  refreshToken: t.procedure
    .input(
      z.object({
        refreshToken: z.string().min(10),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        // Verify the refresh token first
        const claimsJson = await Rapi.checkRefreshJwt(input.refreshToken);
        const claims = JSON.parse(claimsJson) as Rapi.RefreshTokenClaims;

        // Check if refresh token is in store (prevents reuse)
        const storedToken = refreshTokenStore.get(claims.jti);
        if (!storedToken || storedToken.userId !== claims.uid) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Invalid refresh token",
            cause: "INVALID_REFRESH_TOKEN",
          });
        }

        // Rotate refresh token (new JTI)
        const [newAccessToken, newRefreshToken, newJti] =
          await Rapi.rotateRefreshJwt(input.refreshToken);

        // Update store - remove old, add new
        refreshTokenStore.delete(claims.jti);

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30);

        refreshTokenStore.set(newJti, {
          userId: claims.uid,
          email: claims.email,
          jti: newJti,
          expiresAt,
        });

        return {
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
          jti: newJti,
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
    .input(z.object({ jti: z.string().optional() }))
    .mutation(({ input }) => {
      if (input.jti) {
        refreshTokenStore.delete(input.jti);
      }
      return { success: true };
    }),
});

export type AppRouter = typeof appRouter;
