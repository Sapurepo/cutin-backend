# cutin-backend

CUTIN 서비스의 API 서버. 기능 명세는 `CUTIN-FEATURES.md`를 읽는다.

클라이언트는 두 개다 — **iOS 네이티브(SwiftUI)** 메인 앱과 **Next.js** 어드민. 둘 다 이 서버의
OpenAPI 스펙(`pnpm openapi:export` → `openapi.json`)으로 클라이언트 코드를 생성하므로,
**라우트 스키마가 곧 API 계약**이다.

## 스택

| 레이어 | 선택 |
| --- | --- |
| HTTP | Fastify 5 |
| 검증·문서 | Zod + `fastify-type-provider-zod` + `@fastify/swagger` |
| DB | PostgreSQL 16 + Drizzle |
| 잡·스케줄러 | pg-boss (Postgres 기반, Redis 없음) |
| 테스트 | Vitest + Testcontainers |
| Lint/Format | Biome |
| 런타임 | Node 22, TypeScript(ESM), pnpm |

명세는 NestJS를 제안했으나 v12의 전면 개편(ESM·Vitest·oxlint·Standard Schema)이 임박한
시점이라 그린필드 착수에 부적합하다고 판단해 Fastify를 택했다. Zod 스키마 한 벌이 런타임 검증·
타입·OpenAPI를 모두 만들어내는 구성이 Swift 클라이언트 codegen에 결정적이었다.

## 구조 규약

NestJS의 모듈 관례를 쓰지 않는 대신, 아래 규약을 지켜 일관성을 유지한다.

```
src/
  app.ts                  Fastify 인스턴스 조립 (라우트 등록은 전부 여기서)
  server.ts               부트스트랩 · graceful shutdown
  config/env.ts           Zod로 환경변수 파싱 — 누락 시 부팅 실패
  db/
    client.ts             createDatabase(url) → { db, close }
    schema/               Drizzle 테이블 정의 (도메인별 파일)
    migrations/           drizzle-kit 생성물, 직접 수정 금지
  modules/<domain>/
    <domain>Routes.ts     라우트 + 스키마 참조. HTTP 관심사만
    <domain>Service.ts    도메인 규칙. HTTP를 모른다
    <domain>Repository.ts Drizzle 쿼리. 도메인 규칙을 모른다
    <domain>Schemas.ts    요청·응답 Zod 스키마
  shared/                 여러 도메인이 함께 쓰는 것만
  jobs/                   pg-boss 워커
test/                     라우트 레벨 통합 테스트
```

- **도메인 하나 = Fastify 플러그인 하나.** 플러그인은 `FastifyPluginAsyncZod` 타입으로 쓴다.
- 4파일이 모두 필요한 건 아니다. 리포지토리가 얇으면 서비스에 합쳐도 되지만, **라우트에 쿼리를
  직접 쓰지는 않는다.**
- 공용 코드는 두 번째 사용처가 생겼을 때 `shared/`로 옮긴다. 미리 만들지 않는다.

## 코딩 규칙

- **파일·폴더명은 camelCase** (`postService.ts`, `createPostSchema.ts`). kebab-case 금지.
- **상대 임포트에 `.ts` 확장자를 붙인다** (`./appError.ts`). `rewriteRelativeImportExtensions`가
  빌드 시 `.js`로 바꿔준다.
- `erasableSyntaxOnly`가 켜져 있다 — enum·namespace·파라미터 프로퍼티를 쓸 수 없다.
  열거값은 유니언 타입 + `as const` 배열로 표현한다.
- 오류는 `AppError`로 던진다. 응답은 전부 `{ error: { code, message, details? } }` 한 모양이고
  `code`는 클라이언트가 분기에 쓰므로 함부로 바꾸지 않는다.
- 인프라(스토리지·푸시)는 **아직 미정이라 인터페이스로만 다룬다.** 특정 벤더 SDK를 도메인 코드에
  직접 부르지 않는다.

## 확정된 도메인 정책

명세의 미결 항목 중 아래는 확정됐다. 코드가 이와 어긋나면 코드가 틀린 것이다.

- **친구 = 맞팔.** 팔로우는 단방향, 상호 팔로우가 성립하면 `friendships`에 행을 만든다.
  친구공개 포스트는 `friendships` 기준으로만 노출한다.
- **N컷 합성은 iOS가 한다.** 서버는 원본 컷 N장과 합성본을 모두 저장하고 합성하지 않는다.
- **draft는 사용자당 1개.** 애플리케이션 검사가 아니라 partial unique index로 강제한다.
  24시간 후 잡이 삭제한다.
- **알림 슬롯은 4개(아침·점심·저녁·밤) 다중선택.** 리마인더성 푸시만 슬롯에 예약하고
  댓글·반응·팔로우 알림은 즉시 보낸다.
- **동일 이메일이면 계정을 자동 연결한다.** 단 카카오는 이메일 미제공 계정이 있으므로
  email이 없으면 연결하지 않고 새 계정을 만든다.
- **삭제는 소프트 삭제 + 1년 보존** 후 purge 잡이 지운다.

## 개발

```bash
docker compose up -d          # Postgres
cp .env.example .env
pnpm install
pnpm dev                      # http://localhost:3000, 문서는 /docs
```

테스트는 Testcontainers로 Postgres를 직접 띄우므로 **Docker가 실행 중이어야 한다.**

작업을 마치기 전에 항상:

```bash
pnpm lint && pnpm typecheck && pnpm test
```
