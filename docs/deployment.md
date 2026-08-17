# 배포 런북

**상태:** 미착수 — 후속 작업용 문서 · 2026-08-14
**선행 결정:** [`infraVendors.md`](./infraVendors.md) (벤더·조직) · [`clientEnvironments.md`](./clientEnvironments.md) (도메인)

배포는 지금 하지 않는다. 이 문서는 **나중에 이걸만 보고 시작할 수 있게** 남긴다.
저장소에는 Dockerfile도 배포 워크플로도 IaC도 없다 — 바닥부터다.

---

## 목표 구성

| 레이어 | 선택 | 상태 |
| --- | --- | --- |
| 클라우드 | GCP, `asia-northeast3`(서울) | 확정 |
| GCP 조직 | `getcutin.app` Cloud Identity 조직 (개인 소유) | 권고, 미생성 |
| 앱 런타임 | Cloud Run(설정 주의) 또는 GCE VM | **미정** — `infraVendors.md` 2단계 |
| DB | Cloud SQL for PostgreSQL 16 | 확정, 미생성 |
| 잡·스케줄러 | pg-boss (앱 프로세스 안) | 코드 완료 |
| 스토리지 | GCS (S3 호환 XML API) | 확정, **어댑터 미구현** |
| CDN | Cloud CDN → `cdn.getcutin.app` | 확정, 미구성 |
| DNS | Cloudflare | 확정, 미위임 |

---

## ⚠️ 착수 전에 반드시 알아야 할 함정

**전부 이 저장소에서 실제로 확인한 것들이다.** 모르고 시작하면 하루씩 날아간다.

### 1. 스토리지 어댑터 없이 앱을 배포하면 미디어가 사라진다

현재 유일한 구현은 **로컬 디스크**(`localDiskStorage.ts`)다. 컨테이너 파일시스템은 휘발성이라
**재배포·재시작마다 업로드된 사진이 전부 없어진다.** DB에는 `ready`인 미디어 행이 남고
파일만 사라져서, 피드가 깨진 이미지로 가득 찬다.

→ **GCS 어댑터가 앱 배포보다 먼저다.** 순서를 바꾸지 않는다.

### 2. 마이그레이션 SQL이 `dist`에 들어가지 않는다

`src/db/migrate.ts`는 `migrationsFolder: 'src/db/migrations'`를 **CWD 기준 상대 경로**로 읽는다.
그런데 `tsconfig.build.json`은 `.ts`만 컴파일하므로 **`.sql` 파일이 `dist`에 복사되지 않는다.**
확인 결과 `dist/db/migrate.js`는 있지만 `dist` 어디에도 `.sql`이 없다.

→ 이미지에 **`src/db/migrations`를 그대로 COPY**하고, `node dist/db/migrate.js`를
**저장소 루트를 WORKDIR로 두고** 실행해야 한다. (또는 `migrate.ts`의 경로를 고친다 — 코드 변경이다.)

### 3. 시드를 돌리지 않으면 앱이 동작하지 않는다

템플릿과 프레임은 마이그레이션이 아니라 **시드 스크립트**가 넣는다
(`seedTemplates.ts`, `seedFrames.ts`). 이게 없으면 `POST /posts`에 줄 `templateId`가 없어서
**포스트를 하나도 만들 수 없다.** 스키마는 멀쩡한데 기능이 죽는 형태라 원인 찾기가 어렵다.

→ **`node dist/db/seed.js`가 배포 절차의 일부다.** 두 시드 모두 upsert라 반복 실행해도 안전하다.

### 4. CORS가 설정돼 있지 않다 — Next.js 어드민이 막힌다

`src` 전체에 `enableCors` 호출이 없다. iOS 네이티브는 CORS와 무관하지만
**브라우저에서 도는 어드민은 프리플라이트에서 전부 차단된다.**

→ 어드민을 붙이기 전에 `main.ts`에 CORS를 열어야 한다. **코드 변경이라 이번 범위 밖**이고,
어드민 배포 시점에 함께 처리한다. 허용 오리진은 어드민 도메인으로 좁힌다.

### 5. Cloud Run 기본 설정은 리마인더를 조용히 죽인다

`JobScheduler`가 `onModuleInit`에서 인프로세스 cron을 돈다. Cloud Run 기본값은
요청 처리 중에만 CPU를 할당해서 **요청 사이에 타이머가 얼어붙는다. 에러도 안 난다.**

→ Cloud Run을 쓴다면 **`--no-cpu-throttling` + `--min-instances=1`이 둘 다** 필요하다.
자세한 판단은 `infraVendors.md`의 "축 0의 함정".

### 6. pg-boss가 자기 스키마를 만든다

`pgboss` 스키마를 런타임에 생성한다. DB 사용자에게 **`CREATE` 권한**이 필요하다.
그리고 advisory lock을 쓰므로 **transaction-mode pooler 뒤에 두면 안 된다** —
Cloud SQL 직접 연결은 문제없다.

---

## 단계별 작업

각 단계에 **완료 판정**을 달았다. 판정을 통과하지 못하면 다음으로 넘어가지 않는다.

### Phase 0 — 계정·조직·프로젝트

1. `getcutin.app` 도메인 등록
2. 그 도메인으로 **Cloud Identity 조직 생성** (무료 등급)
3. 조직 안에 CUTIN 프로젝트 생성, 결제 계정 연결
4. 예산 알림 설정 (금액은 정하는 사람이 판단)

> **회사 GCP 조직에 만들지 않는다.** 조직 → 조직 없음 이관은 셀프서비스가 안 되고,
> 조직 → 조직도 회사 관리자 승인이 필요하다. 근거는 `infraVendors.md`.

**완료 판정:** `gcloud projects describe <PROJECT_ID>`가 조직 소속으로 나오고, 결제가 연결돼 있다.

### Phase 1 — 스토리지 (앱보다 먼저)

1. GCS 버킷 생성 (`asia-northeast3`, 균일한 버킷 수준 액세스)
2. 서비스 계정 생성 → **HMAC 키 발급** (S3 호환 XML API용)
3. `cdn.getcutin.app`을 Cloud CDN + 버킷에 연결, TLS 인증서 발급
4. Cloudflare에서 `cdn` 레코드를 CDN으로 향하게 설정
5. **`createS3Storage` 어댑터 구현** + `storageModule.ts`에 `STORAGE_DRIVER` 분기

어댑터가 구현할 것은 `StorageService` 인터페이스 6개 메서드뿐이다.
**`createUploadTarget`은 이미 async**라 서명 URL을 바로 반환할 수 있고,
**`url()`은 동기를 유지**한다(퍼블릭 CDN 읽기 전제 — 근거는 `infraVendors.md`).

**완료 판정:** 로컬에서 `STORAGE_DRIVER=s3`로 띄우고 `pnpm test`가 통과하는 것이 아니라
(테스트는 로컬 디스크를 주입한다), **업로드 → complete → `cdn.getcutin.app`에서 이미지 GET**이
수동으로 되는 것.

### Phase 2 — 데이터베이스

1. Cloud SQL for PostgreSQL 16 인스턴스 (`asia-northeast3`)
2. DB·사용자 생성 — **`CREATE` 권한 포함** (함정 6)
3. 비공개 IP 또는 Cloud SQL Auth Proxy로 연결. **transaction pooler를 끼우지 않는다**
4. 자동 백업·PITR 켜기

**완료 판정:** 앱 컨테이너에서 `GET /health`가 `{ status: 'ok', database: 'up' }`을 준다.

### Phase 3 — 컨테이너 이미지

런타임(Cloud Run vs GCE VM)은 `infraVendors.md` 2단계에서 요금 비교 후 정한다.
어느 쪽이든 이미지는 같다.

```dockerfile
# 스케치 — 실제 작성 시 검증할 것
FROM node:22-slim AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.1.1 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN pnpm build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@11.1.1 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY --from=builder /app/dist ./dist
# 함정 2 — .sql은 빌드 산출물에 없다. 경로가 CWD 기준이라 구조를 유지해서 복사한다.
COPY --from=builder /app/src/db/migrations ./src/db/migrations
CMD ["node", "dist/main.js"]
```

주의할 점:

- **`--prod` 설치로 충분하다.** 런타임은 컴파일된 JS를 돌리므로 `@swc-node/register`가 필요 없고,
  `pino-pretty`는 `NODE_ENV=development`에서만 쓰인다. `reflect-metadata`는 prod 의존성이다
- **`HOST`는 `0.0.0.0`이 기본값**이라 그대로 두면 된다. `PORT`는 주입되는 값을 그대로 받는다
  (`env.ts`가 coerce 한다)
- 부팅 시 **환경변수 파싱에 실패하면 즉시 죽는다.** 의도된 동작이고, 로그에 어느 변수가
  잘못됐는지 나온다

**완료 판정:** 로컬에서 `docker run`으로 띄워 `GET /health`가 200.

### Phase 4 — 마이그레이션·시드 실행 자리

배포 파이프라인 안에 **앱 시작 전에 도는 자리**가 필요하다.

```bash
node dist/db/migrate.js   # WORKDIR = 저장소 루트여야 한다 (함정 2)
node dist/db/seed.js      # 템플릿·프레임. 안 돌리면 포스트를 못 만든다 (함정 3)
```

- Cloud Run이면 **Cloud Run Jobs**로 별도 실행
- GCE VM이면 배포 스크립트 안에서
- **앱 컨테이너의 시작 명령에 넣지 않는다** — 인스턴스가 여러 개면 동시에 돈다

**완료 판정:** 빈 DB에서 두 명령을 돌린 뒤 `GET /posts/templates`(또는 프레임 목록)가
비어 있지 않게 나온다.

### Phase 5 — 시크릿 주입

Secret Manager에 넣고 런타임에 환경변수로 주입한다. **이미지에 굽지 않는다.**

`JWT_SECRET` · `DATABASE_URL` · `S3_ACCESS_KEY_ID` · `S3_SECRET_ACCESS_KEY` ·
`APNS_PRIVATE_KEY` · `APNS_KEY_ID` · `APNS_TEAM_ID` (APNs는 어댑터 구현 후)

> ⚠️ `APNS_PRIVATE_KEY`는 PEM이라 개행이 들어간다. 한 줄 env로 넣으면
> `\n` 복원이 필요하고, 빠뜨리면 "키 파싱 실패"로만 터진다 (`appleAccount.md`).

**완료 판정:** 이미지·저장소·CI 로그 어디에도 시크릿 평문이 없다.

### Phase 6 — CD

**스테이징이 손으로 한 번 뜬 뒤에 자동화한다.** 순서를 뒤집으면 디버깅할 것이 두 배가 된다.

`.github/workflows/ci.yml`은 검증만 한다(lint→typecheck→build→test). 여기에 이어서
이미지 빌드·푸시·배포를 붙인다.

**완료 판정:** `dev` 브랜치 머지로 스테이징이 갱신되고, `GET /health`가 200이며,
슬롯 리마인더가 실제로 15분마다 도는 것이 로그로 확인된다 (함정 5).

---

## 배포 시 환경변수

| 변수 | 필수 | 값 |
| --- | --- | --- |
| `NODE_ENV` | | `production` |
| `HOST` | | 기본 `0.0.0.0` 그대로 |
| `PORT` | | 플랫폼이 주입하는 값 |
| `LOG_LEVEL` | | `info` |
| `DATABASE_URL` | ✅ | Cloud SQL. **pooler 경유 금지** |
| `JWT_SECRET` | ✅ | 32자 이상. 환경마다 다른 값 |
| `GOOGLE_CLIENT_ID` | ✅ | iOS 클라이언트 ID |
| `PUBLIC_BASE_URL` | | `https://api.getcutin.app` |
| `MEDIA_BASE_URL` | | `https://cdn.getcutin.app` |
| `STORAGE_DIR` | | GCS 어댑터 후 불필요 |
| `STORAGE_DRIVER` 외 `S3_*` | ✅ | Phase 1 이후. `infraVendors.md` 참조 |
| `APNS_KEY_ID` · `APNS_TEAM_ID` · `APNS_PRIVATE_KEY` · `APNS_BUNDLE_ID` | ✅ | **넷을 다 넣거나 다 빼야 한다.** 일부만 넣으면 부팅 실패, 다 빼면 푸시가 로그로만 남는다. `APNS_BUNDLE_ID`는 환경마다 다르다 (staging은 `.stg`) |

---

## 아직 안 정해진 것

배포를 시작하기 전에 답이 있어야 하는 것들이다.

1. **컨테이너 런타임** — Cloud Run vs GCE VM (`infraVendors.md` 2단계, 요금 비교 필요)
2. **어드민 CORS 허용 오리진** — 함정 4. 어드민 도메인이 정해져야 한다
3. **`openapi.json` 전달 방법** — 이 파일은 **gitignore 대상**이라 저장소에 없다.
   클라이언트 codegen 입력이므로 릴리스마다 어떻게 넘길지 정해야 한다
   (CI 아티팩트 / 별도 저장소 / 배포된 서버의 `/docs-json`)
4. **다중 인스턴스 시 cron 중복** — pg-boss가 조율하지만 실제로 확인한 적이 없다.
   `min-instances=1`·단일 VM이면 해당 없음
5. **로그·모니터링** — Cloud Logging 기본 외에 알림을 걸지

## 후속 과제 (배포와 별개)

- ~~APNs 어댑터~~ — **구현 완료** (`src/shared/push/apnsPushService.ts`). 남은 건 `.p8` 발급과
  `APNS_*` 4종 주입뿐이다. **넷 다 없으면 로그만 남는 구현으로 떨어지므로,
  배포 후 푸시가 안 오면 먼저 이 변수부터 확인한다**
- **Sign in with Apple** — `appleAccount.md`
- **고아 미디어·스토리지 파일 정리 잡** — `retentionJob.ts`의 미완 과제이자
  현재 dead인 `StorageService.remove()`의 첫 호출부. **스토리지가 유료가 되는 순간부터
  비용이 새기 시작한다**
