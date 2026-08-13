# cutin-backend

CUTIN 서비스의 API 서버. 기능 명세는 `CUTIN-FEATURES.md`를 읽는다.

클라이언트는 두 개다 — **iOS 네이티브(SwiftUI)** 메인 앱과 **Next.js** 어드민. 둘 다 이 서버의
OpenAPI 스펙(`pnpm openapi:export` → `openapi.json`)으로 클라이언트 코드를 생성하므로,
**라우트 스키마가 곧 API 계약**이다.

## 스택

| 레이어 | 선택 |
| --- | --- |
| 프레임워크 | NestJS 11 (Fastify 어댑터) |
| 검증·문서 | Zod + `nestjs-zod` + `@nestjs/swagger` |
| DB | PostgreSQL 16 + Drizzle |
| 잡·스케줄러 | pg-boss (Postgres 기반, Redis 없음) |
| 테스트 | Vitest + Testcontainers (변환은 SWC) |
| Lint/Format | Biome |
| 런타임 | Node 22, TypeScript 5.9(ESM), pnpm |

P0~P4는 Fastify로 만들었다가 P5 착수 전에 NestJS로 옮겼다. 이유는 DI 컨테이너,
모듈 경계 강제, 전역 Guard, 그리고 앞으로 필요한 스케줄러·RBAC 생태계다.

**Zod가 유일한 계약이라는 원칙은 그대로다.** `nestjs-zod`의 `createZodDto`로 감싸면
같은 스키마가 런타임 검증·타입·OpenAPI를 계속 함께 만들어낸다. class-validator로 갈아타면
스펙과 런타임이 갈라질 수 있어 쓰지 않는다.

### 이 조합이 강제하는 것

NestJS DI는 런타임에 `design:paramtypes` 메타데이터를 읽는다. 여기서 세 가지가 따라온다.

1. `experimentalDecorators` + `emitDecoratorMetadata`가 필요하다 →
   **`erasableSyntaxOnly`와 `verbatimModuleSyntax`를 쓸 수 없다.**
2. esbuild는 `emitDecoratorMetadata`를 지원하지 않는다 →
   dev·test 변환기가 **SWC**다 (`tsx` 아님, Vitest도 `unplugin-swc` 경유).
3. TypeScript 7 패키지는 컴파일러 JS API를 내보내지 않아 `@swc-node/register`·`@nestjs/cli`가
   깨진다 → **TypeScript는 5.9에 고정**한다.

## 구조 규약

```
src/
  main.ts                    부트스트랩 (NestFactory + FastifyAdapter)
  appModule.ts               루트 모듈. 전역 Guard·Pipe·Interceptor·Filter를 여기서 건다
  appSetup.ts                Fastify 인스턴스에 직접 해야 하는 설정 (본문 파서 등)
  openapi.ts                 OpenAPI 문서 조립
  config/env.ts              Zod로 환경변수 파싱 — 누락 시 부팅 실패
  db/
    client.ts                createDatabase(url) → { db, close }
    databaseModule.ts        DATABASE 토큰 제공 (@Global)
    schema/                  Drizzle 테이블 정의 (도메인별 파일)
    migrations/              drizzle-kit 생성물, 직접 수정 금지
  modules/<domain>/
    <domain>Module.ts        의존 모듈을 imports로 명시. 재사용할 것만 exports
    <domain>Controller.ts    HTTP 관심사만. 쿼리를 직접 쓰지 않는다
    <domain>Service.ts       도메인 규칙. HTTP를 모른다
    <domain>Repository.ts    Drizzle 쿼리. 도메인 규칙을 모른다
    <domain>Schemas.ts       Zod 스키마 + `createZodDto` 래퍼
  shared/                    여러 도메인이 함께 쓰는 것만
  jobs/                      pg-boss 스케줄 + 잡 본체.
                             잡은 `now`를 인자로 받는다 — 테스트가 큐를 띄우지 않고
                             시각을 주입해 직접 호출하기 위해서다
test/                        라우트 레벨 통합 테스트
```

- **도메인 하나 = Nest 모듈 하나.** 모듈 간 의존은 `imports`/`exports`로 드러낸다.
  순환이 생기면 부팅에서 터지므로 그때 경계를 다시 본다.
- 5파일이 모두 필요한 건 아니다. 리포지토리가 얇으면 서비스에 합쳐도 되지만, **컨트롤러에 쿼리를
  직접 쓰지는 않는다.**
- 공용 코드는 두 번째 사용처가 생겼을 때 `shared/`로 옮긴다. 미리 만들지 않는다.
- 교체 가능한 것은 심볼 토큰으로 주입한다 (`DATABASE`, `STORAGE`, `OAUTH_VERIFIER`).
  테스트가 `overrideProvider`로 갈아끼운다.

## 코딩 규칙

- **파일·폴더명은 camelCase** (`postService.ts`, `createPostSchema.ts`). kebab-case 금지.
- **상대 임포트에 `.ts` 확장자를 붙인다** (`./appError.ts`). `rewriteRelativeImportExtensions`가
  빌드 시 `.js`로 바꿔준다.
- **DI로 주입되거나 파라미터 타입으로 쓰이는 클래스는 `import type`으로 들여오지 않는다.**
  타입만 남으면 `design:paramtypes`가 비어 주입이 조용히 깨지고, DTO는 검증이 통째로 건너뛰어진다.
  이래서 Biome의 `useImportType` 규칙을 꺼두었다.
- enum·namespace는 여전히 쓰지 않는다. 열거값은 유니언 타입 + `as const` 배열로 표현한다.
  (파라미터 프로퍼티는 NestJS 관례라 허용한다.)
- **인증은 deny-by-default다.** 전역 `AuthGuard`가 모든 라우트를 막고 `@Public()`으로만 뚫는다.
  라우트를 추가하다 인증을 빠뜨려도 공개되지 않는다.
- 오류는 `AppError`로 던진다. 응답은 전부 `{ error: { code, message, details? } }` 한 모양이고
  `code`는 클라이언트가 분기에 쓰므로 함부로 바꾸지 않는다.
- 인프라(스토리지·푸시)는 **아직 미정이라 인터페이스로만 다룬다.** 특정 벤더 SDK를 도메인 코드에
  직접 부르지 않는다.

## 확정된 도메인 정책

명세의 미결 항목 중 아래는 확정됐다. 코드가 이와 어긋나면 코드가 틀린 것이다.

- **친구 = 맞팔.** 팔로우는 단방향, 상호 팔로우가 성립하면 `friendships`에 행을 만든다.
  친구공개 포스트는 `friendships` 기준으로만 노출한다.
- **N컷 합성은 iOS가 한다.** 서버는 원본 컷 N장과 합성본을 모두 저장하고 합성하지 않는다.
- **템플릿(레이아웃)과 프레임(외형)은 별개 리소스다.** 한쪽에 합치면 조합이 곱해진다.
  `aspectRatio`·`slots`는 **컷 그리드 영역 기준**이며 프레임 여백(padding·gutter)과
  푸터를 포함하지 않는다 — 최종 캔버스는 클라이언트가 둘을 합쳐 유도한다.
  프레임의 길이 값은 전부 캔버스 폭 대비 비율이다.
- **보관(북마크)은 계정에 붙는다.** 기기를 바꿔도 따라가야 하므로 서버가 소유한다.
  포스트를 삭제하면 보관도 함께 정리한다.
- **draft는 사용자당 1개.** 애플리케이션 검사가 아니라 partial unique index로 강제한다.
  24시간 후 잡이 삭제한다.
- **알림 슬롯은 4개(아침 08 · 점심 12 · 저녁 18 · 밤 21) 다중선택.** 리마인더성 푸시만
  슬롯에 예약하고 댓글·반응·팔로우 알림은 즉시 보낸다.
  발송 시각은 서버 타임존이 아니라 **디바이스 타임존** 기준이다.
  시각 표는 `notifications/slotSchedule.ts` 한곳에만 있다.
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
