declare module 'fastify' {
  interface FastifyRequest {
    /** `AuthGuard`가 채운다. `@Public()` 라우트에서는 undefined. */
    userId?: string
  }
}

export {}
