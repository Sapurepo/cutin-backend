import swc from 'unplugin-swc'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Vitest 기본 변환기(esbuild)는 emitDecoratorMetadata를 지원하지 않아 Nest DI가 깨진다.
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    environment: 'node',
    // 앱은 DATABASE_URL을 요구하지만 테스트는 컨테이너 URI를 직접 넘기므로 자리표시자를 채운다.
    env: {
      DATABASE_URL: 'postgres://placeholder',
      JWT_SECRET: 'test-secret-test-secret-test-secret-1234',
      GOOGLE_CLIENT_ID: 'test-google-client-id',
    },
    include: ['test/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
})
