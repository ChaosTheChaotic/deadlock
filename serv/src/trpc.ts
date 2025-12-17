import { initTRPC, TRPCError } from "@trpc/server";
import type { CreateNextContextOptions } from "@trpc/server/adapters/next";
import { z } from "zod";
import * as Rapi from "./rlibs/index";

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
    token = typeof authHeader === "string" ? authHeader : undefined;
  }

  return {
    token,
  };
};
export type Ctx = ReturnType<typeof createCtx>;

export const t = initTRPC.context<Ctx>().create();

const authMiddleware = t.middleware(async ({ ctx, next }) => {
  if (!ctx.token) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Missing authentication token",
    });
  }

  try {
    const claimsJson = await Rapi.checkJwt(ctx.token);
    let claims: Record<string, unknown>;
    try {
      claims = JSON.parse(claimsJson) as Record<string, unknown>;
    } catch {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Invalid token format",
      });
    }
    return next({
      ctx: {
        ...ctx,
        user: claims,
      },
    });
  } catch (error) {
    if (error instanceof TRPCError) {
      throw error;
    }
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Invalid or expired token",
    });
  }
});

export const protectedProcedure = t.procedure.use(authMiddleware);

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
    .input(z.object({ email: z.email(), pass: z.string() }))
    .mutation(async ({ input }) => {
      const isValid = await Rapi.checkPass(input.email, input.pass);
      if (!isValid) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid email or password",
        });
      }

      const usrs = await Rapi.searchUsers(input.email);
      if (usrs.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      const usr = usrs[0];
      const accessToken = await Rapi.genJwt(usr.uid, usr.email);
      const refreshToken = await Rapi.genJwt(usr.uid, usr.email);

      return {
        accessToken,
        refreshToken,
        user: {
          uid: usr.uid,
          email: usr.email,
        },
      };
    }),
  register: t.procedure
    .input(
      z.object({
        email: z.email(),
        pass: z.string().optional(),
        oauthProvider: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const existingUsers = await Rapi.searchUsers(input.email);
      if (existingUsers.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "User already exists",
        });
      }

      const user = await Rapi.createUser(
        input.email,
        input.pass,
        input.oauthProvider,
      );
      const accessToken = await Rapi.genJwt(user.uid, user.email);
      const refreshToken = await Rapi.genJwt(user.uid, user.email);

      return {
        accessToken,
        refreshToken,
        user: {
          uid: user.uid,
          email: user.email,
        },
      };
    }),

  refreshToken: t.procedure
    .input(z.object({ refreshToken: z.string() }))
    .mutation(async ({ input }) => {
      const newToken = await Rapi.refreshJwt(input.refreshToken);
      return {
        accessToken: newToken,
      };
    }),
});

export type AppRouter = typeof appRouter;
