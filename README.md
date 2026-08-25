<div align="center">

# CUTIN Backend

**사진 컷을 템플릿으로 가공해 친구들과 공유하는 소셜 기록 서비스, CUTIN의 API 서버.**

[![CI](https://github.com/Sapurepo/cutin-backend/actions/workflows/ci.yml/badge.svg)](https://github.com/Sapurepo/cutin-backend/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white)](https://nestjs.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org)

**한국어** · [English](./README.en.md)

</div>

---

## 목차

- [소개](#소개)
- [설계 원칙](#설계-원칙)
- [기술 스택](#기술-스택)
- [시작하기](#시작하기)
- [환경 변수](#환경-변수)
- [프로젝트 구조](#프로젝트-구조)
- [API](#api)
- [개발 워크플로](#개발-워크플로)
- [테스트](#테스트)
- [기여하기](#기여하기)
- [문서](#문서)
- [라이선스](#라이선스)

## 소개

CUTIN은 사진 컷을 촬영해 템플릿으로 합성하고, 친구들과 포스트를 공유·반응하는 소셜 기록
서비스입니다. 이 저장소는 그 **API 서버**입니다.

클라이언트는 두 개이며 둘 다 이 서버를 바라봅니다.

| 저장소 | 역할 |
| --- | --- |
| `cutin-ios` | 메인 앱 (SwiftUI) |
| `cutin-frontend` | 어드민 (Next.js) |
| **`cutin-backend`** | **API 서버 — 이 저장소** |

두 클라이언트 모두 이 서버가 내보내는 OpenAPI 스펙으로 코드를 생성합니다. 따라서
**라우트 스키마가 곧 API 계약**이고, 스키마를 고치는 일은 클라이언트를 고치는 일입니다.

## 설계 원칙

프로젝트 전반을 관통하는 결정들입니다. 코드를 읽기 전에 알아 두면 "왜 이렇게 짜여 있지?"가
줄어듭니다.

**Zod가 유일한 계약입니다.** `nestjs-zod`의 `createZodDto`로 감싼 스키마 하나가 런타임 검증 ·
TypeScript 타입 · OpenAPI 문서를 함께 만들어냅니다. class-validator를 쓰지 않는 이유는
스펙과 런타임이 갈라질 수 있어서입니다.

**인증은 deny-by-default입니다.** 전역 `AuthGuard`가 모든 라우트를 막고 `@Public()`으로만
뚫습니다. 라우트를 추가하다 인증을 빠뜨려도 공개되지 않습니다. 현재 49개 오퍼레이션 중
44개가 보호되고, 공개된 5개는 health · 인증 3종 · 이미지 조회입니다.

**오류는 한 모양입니다.** 모든 실패 응답이 `{ error: { code, message, details? } }`이고
`code`는 클라이언트가 분기에 씁니다. 도메인 코드는 `AppError`를 던지고 전역 필터가 변환합니다.

**도메인 하나 = 모듈 하나.** 모듈 간 의존은 `imports`/`exports`로 드러냅니다. 순환이 생기면
부팅에서 터지므로, 그때 경계를 다시 봅니다.

**인프라는 인터페이스 뒤에 있습니다.** 스토리지·푸시는 벤더가 확정되지 않아 심볼 토큰
(`STORAGE`, `OAUTH_VERIFIER`)으로 주입합니다. 도메인 코드가 특정 SDK를 직접 부르지 않으므로
테스트가 `overrideProvider`로 갈아끼웁니다.

**N컷 합성은 서버가 하지 않습니다.** 클라이언트가 합성하고, 서버는 원본 컷 N장과 합성본을
모두 저장합니다.

## 기술 스택

| 레이어 | 선택 |
| --- | --- |
| 프레임워크 | NestJS 11 (Fastify 어댑터) |
| 검증·문서 | Zod + `nestjs-zod` + `@nestjs/swagger` |
| DB | PostgreSQL 16 + Drizzle ORM |
| 잡·스케줄러 | pg-boss (Postgres 기반, Redis 없음) |
| 테스트 | Vitest + Testcontainers |
| Lint·Format | Biome |
| 런타임 | Node 22, TypeScript 5.9 (ESM), pnpm |

<details>
<summary><b>이 조합이 강제하는 제약</b> — 빌드 설정을 건드리기 전에 읽어 주세요</summary>

NestJS의 DI는 런타임에 `design:paramtypes` 메타데이터를 읽습니다. 여기서 세 가지가 따라옵니다.

1. `experimentalDecorators` + `emitDecoratorMetadata`가 필요합니다 →
   **`erasableSyntaxOnly`와 `verbatimModuleSyntax`를 쓸 수 없습니다.**
2. esbuild는 `emitDecoratorMetadata`를 지원하지 않습니다 →
   dev·test 변환기가 **SWC**입니다 (`tsx`가 아니며, Vitest도 `unplugin-swc`를 경유합니다).
3. TypeScript 7 패키지는 컴파일러 JS API를 내보내지 않아 `@swc-node/register`가 깨집니다 →
   **TypeScript는 5.9에 고정**합니다.

</details>

## 시작하기

### 요구사항

- **Node.js 22** 이상
- **pnpm** (`packageManager` 필드에 버전이 고정돼 있습니다 — `corepack enable`을 권장합니다)
- **Docker** — 로컬 Postgres와 테스트용 Testcontainers가 씁니다

### 설치와 실행

```bash
git clone https://github.com/Sapurepo/cutin-backend.git
cd cutin-backend

pnpm install
cp .env.example .env      # 기본값 그대로 로컬에서 동작합니다
docker compose up -d      # PostgreSQL 16

pnpm db:migrate           # 스키마 적용
pnpm db:seed              # 템플릿·프레임 시드 — 없으면 포스트를 만들 수 없습니다
pnpm dev
```

- API — <http://localhost:3000>
- Swagger UI — <http://localhost:3000/docs>

> [!NOTE]
> `pnpm db:seed`를 건너뛰면 템플릿이 없어 포스트 생성이 전부 실패합니다.
> 포트는 `.env`의 `PORT`로 바꿀 수 있습니다.

## 환경 변수

`src/config/env.ts`가 Zod로 파싱하며, **필수 값이 빠지면 부팅이 실패합니다.** 조용히 기본값으로
넘어가지 않습니다.

| 변수 | 필수 | 설명 |
| --- | :---: | --- |
| `DATABASE_URL` | ✅ | PostgreSQL 접속 문자열 |
| `JWT_SECRET` | ✅ | 32자 이상. `openssl rand -hex 32` |
| `GOOGLE_CLIENT_ID` | ✅ | Google OAuth `id_token`의 audience 검증에 씁니다 |
| `PUBLIC_BASE_URL` | ✅ | 서버 자신의 공개 주소 (업로드 목적지·공유 링크) |
| `MEDIA_BASE_URL` | | 클라이언트에 내려줄 미디어 URL 앞부분. 미설정 시 `PUBLIC_BASE_URL` |
| `STORAGE_DIR` | | 로컬 디스크 스토리지 경로 (벤더 확정 시 제거 예정) |
| `HOST` · `PORT` · `LOG_LEVEL` · `NODE_ENV` | | 기본값이 있습니다 |
| `APNS_KEY_ID` · `APNS_TEAM_ID` · `APNS_PRIVATE_KEY` · `APNS_BUNDLE_ID` | | 아래 참고 |

APNs 네 값은 **모두 채우거나 모두 비워야 합니다.** 일부만 채우면 부팅이 실패하는데, 이는
"설정했는데 푸시가 안 온다"를 막기 위한 의도적인 동작입니다. 전부 비어 있으면 로깅 구현으로
폴백하므로 로컬 개발에는 지장이 없습니다.

## 프로젝트 구조

```
src/
  main.ts                    부트스트랩 (NestFactory + FastifyAdapter)
  appModule.ts               루트 모듈 — 전역 Guard·Pipe·Interceptor·Filter를 여기서 겁니다
  appSetup.ts                Fastify 인스턴스에 직접 해야 하는 설정
  openapi.ts                 OpenAPI 문서 조립
  config/env.ts              Zod 환경변수 파싱
  db/
    schema/                  Drizzle 테이블 정의 (도메인별 파일)
    migrations/              drizzle-kit 생성물 — 직접 수정하지 않습니다
  modules/<domain>/
    <domain>Module.ts        의존 모듈을 imports로 명시
    <domain>Controller.ts    HTTP 관심사만 — 쿼리를 직접 쓰지 않습니다
    <domain>Service.ts       도메인 규칙 — HTTP를 모릅니다
    <domain>Repository.ts    Drizzle 쿼리 — 도메인 규칙을 모릅니다
    <domain>Schemas.ts       Zod 스키마 + createZodDto 래퍼
  shared/                    여러 도메인이 함께 쓰는 것만
  jobs/                      pg-boss 스케줄과 잡 본체
assets/frames/               프레임 장식 PNG — 소스와 함께 배포되는 자산입니다
test/                        라우트 레벨 통합 테스트
```

`assets/frames/`는 저장소(`STORAGE_DIR`)가 아니라 **소스와 함께 나가는 자산**입니다.
`GET /frames`가 주는 장식 URL이 여기를 가리키고, DB에는 파일 이름만 담습니다 —
URL은 읽는 시점에 `PUBLIC_BASE_URL`로 만들어 주소가 바뀌어도 기존 행이 따라옵니다.
그림을 굽는 스크립트는 클라이언트 저장소에 있습니다(`cutin-ios` `Scripts/frames/`).
경로가 cwd 기준이라 `pnpm dev`·`node dist/main.js` 모두 **저장소 루트에서** 실행합니다.

다섯 파일이 항상 필요하지는 않습니다. 리포지토리가 얇으면 서비스에 합쳐도 되지만,
**컨트롤러에 쿼리를 직접 쓰지는 않습니다.** 공용 코드는 두 번째 사용처가 생겼을 때
`shared/`로 옮깁니다 — 미리 만들지 않습니다.

잡은 `now`를 인자로 받습니다. 테스트가 큐를 띄우지 않고 시각을 주입해 직접 호출하기
위해서입니다.

## API

38개 경로 · 49개 오퍼레이션입니다. 서버를 띄우고 `/docs`에서 직접 호출해 볼 수 있습니다.

| 그룹 | 오퍼레이션 | 내용 |
| --- | :---: | --- |
| `auth` | 3 | OAuth 로그인 · 토큰 재발급 · 로그아웃 |
| `users` | 6 | 프로필 · 온보딩 · 설정 |
| `posts` | 12 | 작성(draft) · 발행 · 피드 · 템플릿 · 프레임 |
| `social` | 10 | 팔로우 · 친구(맞팔) · 차단 · 검색 · 추천 |
| `media` | 4 | 업로드 · 조회(`Range` 지원) |
| `comments` · `reactions` | 5 | 댓글 · 반응 |
| `bookmarks` | 2 | 보관 |
| `notifications` · `devices` | 5 | 인앱 알림 · 디바이스 등록 |
| `reports` | 1 | 신고 |
| `system` | 1 | health |

이 표 밖에 **HTML 페이지가 하나** 있습니다(스펙에서 제외). `GET /p/{id}`는 공유 링크와
QR이 여는 공개 페이지로, 합성본과 촬영 영상을 보여줍니다. 로그인 없이 열리고 `private`
포스트만 막습니다 — 링크를 아는 사람은 볼 수 있다는 뜻입니다(unlisted).

```bash
pnpm openapi:export   # openapi.json 생성 — 클라이언트 codegen 입력
```

> [!IMPORTANT]
> 라우트 스키마를 바꾸면 두 클라이언트의 생성 코드가 함께 바뀝니다. 특히 오류 `code`는
> 클라이언트가 분기에 쓰므로 함부로 바꾸지 않습니다.

## 개발 워크플로

| 명령 | 설명 |
| --- | --- |
| `pnpm dev` | 개발 서버 (파일 변경 시 재시작) |
| `pnpm build` / `pnpm start` | 프로덕션 빌드 / 실행 |
| `pnpm lint` / `pnpm lint:fix` | Biome 검사 / 자동 수정 |
| `pnpm format` | Biome 포매팅 |
| `pnpm typecheck` | 타입 검사 |
| `pnpm test` / `pnpm test:watch` | 테스트 |
| `pnpm db:generate` | 스키마 변경 → 마이그레이션 생성 |
| `pnpm db:migrate` | 마이그레이션 적용 |
| `pnpm db:seed` | 템플릿·프레임 시드 |
| `pnpm db:studio` | Drizzle Studio |
| `pnpm openapi:export` | `openapi.json` 산출 |

작업을 마치기 전에 항상 아래 셋을 통과시켜 주세요. CI가 같은 것을 돌립니다.

```bash
pnpm lint && pnpm typecheck && pnpm test
```

### 코딩 규칙

- **파일·폴더명은 camelCase** (`postsService.ts`). kebab-case를 쓰지 않습니다
- **상대 임포트에 `.ts` 확장자를 붙입니다** (`./appError.ts`).
  `rewriteRelativeImportExtensions`가 빌드 시 `.js`로 바꿉니다
- **DI로 주입되거나 파라미터 타입으로 쓰이는 클래스는 `import type`으로 들여오지 않습니다.**
  타입만 남으면 `design:paramtypes`가 비어 주입이 조용히 깨지고, DTO는 검증이 통째로
  건너뛰어집니다. 이래서 Biome의 `useImportType` 규칙을 꺼 두었습니다
- enum·namespace를 쓰지 않습니다. 열거값은 유니언 타입 + `as const` 배열로 표현합니다

## 테스트

라우트 레벨 통합 테스트입니다. 목을 최소로 두고 실제 HTTP 요청과 실제 Postgres를 씁니다.

```bash
pnpm test          # Docker가 실행 중이어야 합니다
```

Testcontainers가 Postgres를 직접 띄우므로 별도 준비가 필요 없습니다. 스토리지·푸시처럼
외부에 나가는 것만 토큰으로 갈아끼웁니다.

> [!WARNING]
> 테스트는 `setupOpenapi`를 타지 않으므로 **Swagger UI 경로는 검증되지 않습니다.**
> 의존성을 건드렸다면 `pnpm dev`로 실제 부팅을 한 번 확인해 주세요 — `@fastify/static`을
> 제거했을 때 lint·typecheck·test가 모두 통과한 채로 앱만 죽은 적이 있습니다.

## 기여하기

이슈와 PR을 환영합니다.

### 시작하기 전에

- **버그·기능 제안은 [이슈](https://github.com/Sapurepo/cutin-backend/issues)로 먼저 열어 주세요.**
  클라이언트에서 올라온 API 요청이라면 원하는 요청·응답 모양을 함께 적어 주시면 좋습니다
- 큰 변경은 구현 전에 이슈에서 방향을 맞추는 편이 서로 시간을 아낍니다

### 작업 흐름

1. `dev`에서 브랜치를 땁니다 — `feature/…`, `fix/…`, `docs/…`, `refactor/…`
2. 변경을 만들고 **테스트를 함께 씁니다.** 버그 수정이라면 재현 테스트를 먼저 쓰고 고칩니다
3. `pnpm lint && pnpm typecheck && pnpm test`를 통과시킵니다
4. `dev`를 대상으로 PR을 엽니다. CI가 같은 검사를 다시 돌립니다

### 커밋 메시지

`[TYPE] 무엇을 왜 바꿨는지` 형식입니다. TYPE은 `FEATURE` · `FIX` · `REFACTOR` · `DOCS` ·
`SETUP` · `UPDATE`를 씁니다.

```
[FEATURE] 프로필 목록은 고정을 맨 앞에 둔다 — 커서가 (pinned, publishedAt) 복합키가 된다
```

제목은 **무엇을 했는지가 아니라 무엇이 달라지는지**를 적습니다. 판단이 필요했던 지점은
본문에 이유를 남겨 주세요. 나중에 그 코드를 만지는 사람이 읽습니다.

### 리뷰에서 주로 보는 것

- 변경된 모든 줄이 이슈나 PR의 목적으로 이어지는지 (관련 없는 정리는 별도 PR로)
- 새 동작에 테스트가 붙었는지
- 라우트 스키마가 바뀌었다면 클라이언트에 미치는 영향이 PR 본문에 적혔는지
- 기존 코드의 스타일·주석 밀도와 어긋나지 않는지

## 문서

| 문서 | 내용 |
| --- | --- |
| [`CUTIN-FEATURES.md`](./CUTIN-FEATURES.md) | 서비스 기능 명세 |
| [`CLAUDE.md`](./CLAUDE.md) | 아키텍처 규약과 확정된 도메인 정책 |
| [`docs/deployment.md`](./docs/deployment.md) | 배포 런북과 착수 전 함정 |
| [`docs/infraVendors.md`](./docs/infraVendors.md) | 인프라 벤더 비교 |
| [`docs/clientEnvironments.md`](./docs/clientEnvironments.md) | 클라이언트 빌드 구성과 도메인 |
| [`docs/appleAccount.md`](./docs/appleAccount.md) | Apple 계정·APNs 키 발급 절차 |

## 라이선스

[MIT](./LICENSE) © Sapu
