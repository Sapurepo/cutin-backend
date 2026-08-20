# cutin-backend

CUTIN 서비스의 API 서버. iOS 네이티브 앱과 Next.js 어드민이 함께 사용한다.

기능 명세는 [`CUTIN-FEATURES.md`](./CUTIN-FEATURES.md), 아키텍처·코딩 규약은
[`CLAUDE.md`](./CLAUDE.md)를 참고한다.

**스택:** NestJS 11(Fastify 어댑터) · TypeScript 5.9(ESM) · Zod · Drizzle · PostgreSQL 16 ·
pg-boss · Vitest · Biome

## 시작하기

Node 22 이상과 Docker가 필요하다.

```bash
pnpm install
cp .env.example .env
docker compose up -d
pnpm dev
```

- API: http://localhost:3000
- API 문서: http://localhost:3000/docs

## 스크립트

| 명령 | 설명 |
| --- | --- |
| `pnpm dev` | 개발 서버 (파일 변경 시 재시작) |
| `pnpm test` | Vitest — Testcontainers로 Postgres를 띄우므로 Docker 필요 |
| `pnpm lint` / `pnpm format` | Biome 검사 / 포매팅 |
| `pnpm typecheck` | 타입 검사 |
| `pnpm db:generate` / `pnpm db:migrate` | Drizzle 마이그레이션 생성 / 적용 |
| `pnpm openapi:export` | `openapi.json` 산출 (클라이언트 codegen 입력) |
| `pnpm build` / `pnpm start` | 프로덕션 빌드 / 실행 |
