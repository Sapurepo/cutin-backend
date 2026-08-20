# 인프라 벤더 — 호스팅·스토리지 결정

**상태:** **벤더 확정 — GCP 일원화 (서울 리전) + GCS 스토리지** · 2026-08-14
**남은 결정:** GCP 조직 배치 · 컨테이너 런타임 → "먼저 정해야 할 것" 4·5번

프론트엔드에서 "벤더가 정해져야 배포와 `Release.xcconfig`가 풀린다"는 요청이 올라왔다.
xcconfig 쪽은 벤더와 무관하게 풀 수 있어 [`clientEnvironments.md`](./clientEnvironments.md)로 분리했고,
이 문서는 **남은 진짜 결정**만 다룬다.

## 결정 요약

| 항목 | 결정 | 비고 |
| --- | --- | --- |
| 클라우드 | **GCP** | 팀에 이미 운영 지식이 있다 |
| 리전 | **`asia-northeast3` (서울)** | 축 5의 국외이전 고지가 불필요해진다 |
| Postgres | **Cloud SQL for PostgreSQL** | direct connection ⭕ (pg-boss advisory lock) |
| 스토리지·CDN | **GCS + Cloud CDN** | egress 유료를 감수. **재검토 트리거** 있음 |
| DNS | **Cloudflare** (GCP와 무관) | 벤더 중립 — `clientEnvironments.md` §1.2 |
| GCP 조직 | 🔶 **개인 조직 신설 권고** | 회사 조직에 만들면 뺄 수 없다 |
| 컨테이너 런타임 | 🔶 미정 | Cloud Run 기본 설정은 **탈락** — 아래 함정 |

---

## 조사 시점의 저장소 상태

| 항목 | 값 |
| --- | --- |
| Dockerfile | **없음** |
| 배포 워크플로 | **없음** — `.github/workflows/ci.yml`은 lint·typecheck·build·test 검증만 |
| IaC (Terraform 등) | **없음** |
| `docker-compose.yml` | 로컬 Postgres 전용. 앱 서비스 없음 |
| 클라우드 SDK 의존성 | **전무** |
| 스토리지 구현 | 로컬 디스크 1개. `STORAGE` 토큰 뒤로 격리돼 있어 교체 지점은 깨끗하다 |
| 큐·스케줄러 | pg-boss (Postgres 기반) — **Redis 불필요** |

즉 **바닥부터 시작한다.** 되돌릴 비용이 없는 대신, 고를 것이 많다.

---

## 핵심 판단

### 1. 탈락 필터가 먼저다 — 선택지를 절반으로 줄인다

`src/jobs/jobsModule.ts`의 `JobScheduler`는 `onModuleInit`에서 `boss.start()`를 부르고
**인프로세스 cron**(`*/15 * * * *`)으로 리마인더를 돌린다. **API 프로세스가 곧 워커다.**

여기서 두 개의 하드 필터가 나온다.

- **상시 실행 컨테이너여야 한다.** scale-to-zero·서버리스 함수·edge 런타임은
  프로세스가 잠들면 cron이 멈춘다. NestJS의 `reflect-metadata`/`design:paramtypes`도
  Workers류 런타임에서 돌지 않는다. → **비교 대상이 아니라 탈락 대상이다.**
- **Postgres는 direct connection이어야 한다.** pg-boss는 advisory lock을 쓰므로
  transaction-mode pooler(PgBouncer·Supavisor) 뒤에서는 동작이 깨진다.
  관리형 Postgres 후보를 볼 때 이게 첫 확인 항목이다.

### 2. 스토리지 결정과 호스팅 결정을 분리한다

**한 문서에서 둘을 한 번에 받으려 하면 둘 다 안 난다.**

- **스토리지는 되돌릴 수 있는 결정이다.** S3 호환 API가 사실상 표준이라
  (R2·B2·NCP Object Storage·MinIO 전부) 어댑터 코드가 동일하고, 옮기는 비용이 낮다.
- **호스팅·Postgres는 lock-in이 크다.** IaC·시크릿 관리·마이그레이션 실행 경로가 함께 딸려온다.

→ **스토리지를 먼저 확정하고, 호스팅은 그 다음에 고른다.**

> **결과적으로 둘 다 GCP로 갔지만 이 판단은 폐기되지 않았다.**
> 스토리지가 되돌릴 수 있는 결정이라는 사실이 그대로라서,
> egress 비용이 문제가 되면 스토리지만 떼어 옮길 수 있다 (아래 "재검토 트리거").
> 일원화는 **선택이지 구속이 아니다.**

### 3. 비교하지 않는 것

문서가 산만해지면 결정이 안 난다. 아래는 의도적으로 비교 축에서 뺀다.

- **Redis·관리형 큐** — pg-boss가 Postgres만 쓴다. 번들 Redis는 가점이 아니다
- **이미지 변환·썸네일 기능** — 명세상 2차다. 벤더 기능으로 비교하면 결정이 흐려진다
- **Kubernetes** — 현재 규모에 해당 없음

---

## 비교 축

추상적 장단점이 아니라 CUTIN의 실제 조건에서 나온 축만 쓴다.

| # | 축 | 왜 이게 축인가 |
| --- | --- | --- |
| 0 | **상시 컨테이너 + direct PG** | 탈락 필터. X면 아래를 채우지 않는다 |
| 1 | **egress 단가** | 이미지 피드는 비용이 전송량에 지배된다 |
| 2 | **리전·PoP** | 한국 사용자. API는 서울 또는 도쿄, CDN은 한국 PoP |
| 3 | **첫 배포까지 사람-일** | Dockerfile 0개에서 출발한다. MVP 일정이 실제 제약 |
| 4 | **S3 호환 여부** | 호환이면 어댑터가 같고 결정이 되돌려진다 (판단 2) |
| 5 | **데이터 저장 리전** | 국내가 아니면 개인정보 처리방침에 국외이전 고지가 필요하고, App Store 개인정보 라벨과 일치시켜야 한다 |
| 6 | **운영 최소선** | 백업/PITR, 로그, 시크릿 저장소, **`pnpm db:migrate`를 돌릴 자리**(릴리즈 훅 또는 원샷 잡) |

### 축 1을 채우는 방법

egress 총액은 아래 식으로 나온다. **가정값이 없으면 표를 채울 수 없고, 그러면 결정도 안 난다.**

```
월 전송량 ≈ MAU × (1인당 월 피드 조회수) × (조회당 이미지 수) × (평균 이미지 크기)
월 저장 증가량 ≈ MAU × (1인당 월 포스트 수) × (컷 N장 + 합성본 1장) × (평균 이미지 크기)
```

- 서버는 **원본 컷 N장과 합성본을 모두 저장한다**(합성은 iOS가 한다). 저장량이 포스트당 N+1장이다
- 업로드 상한은 15MB지만 실제 평균은 그보다 훨씬 작다 — **측정하거나 가정을 명시해야 한다**
- MAU **1천 / 1만 / 10만** 세 시나리오로 계산한다. 하나만 보면 판단이 갈린다

> **미확정:** 1인당 월 포스트 수 · 평균 이미지 크기 · 조회당 이미지 수.
> 아래 "먼저 정해야 할 것" 3번.

---

## 선택지

개별 서비스가 아니라 **조합 단위**로만 본다. 서비스를 나열하면 결정이 안 난다.

### A. 클라우드 일원화 (**GCP 채택 — 2026-08-14**) {#a-클라우드-일원화}

컨테이너 + 관리형 Postgres + 오브젝트 스토리지 + CDN을 한 계정에서.
**GCP로 정했다** — 팀이 이미 GCP를 쓰고 있어 운영 지식이 있다는 것이 결정적이었다.

- 축 2 ⭕ 서울 리전 `asia-northeast3`
- 축 0 direct PG ⭕ **Cloud SQL은 강제 pooler가 없어 pg-boss advisory lock에 문제없다**
- 축 4 🔶 **GCS는 XML API + HMAC 키로 AWS SDK를 그대로 쓸 수 있다.** 완전한 S3 호환은 아니지만
  우리가 쓰는 범위(put/get/stat/presign)는 커버된다
- 축 1 ❌ **egress가 유료다.** R2 대비 불리하고, 트래픽이 늘수록 차이가 커진다 → 아래 "재검토 트리거"
- 축 3 ❌ 세팅할 것이 많다

#### ⚠️ 축 0의 함정 — Cloud Run 기본 설정은 탈락이다

Cloud Run의 **기본값은 요청 처리 중에만 CPU를 할당한다.** 요청 사이에는 백그라운드 타이머가 얼어붙어
`JobScheduler`의 인프로세스 cron(`*/15 * * * *`)이 **조용히 안 돈다.** 에러도 안 난다.

통과시키려면 **`--no-cpu-throttling` + `--min-instances=1`** 이 둘 다 필요하다
(min-instances 없이 0으로 줄어들면 CPU를 할당할 인스턴스 자체가 없다).
**그러면 사실상 상시 VM 비용이고 서버리스의 비용 이점이 사라진다** — 그 값이면
GCE VM·GKE Autopilot과 정직하게 비교해야 한다. Cloud Run을 "싸다"는 이유로 고르면 안 된다.

> 대안으로 Cloud Scheduler + HTTP 엔드포인트로 cron을 밖으로 빼는 방법이 있다.
> 다만 그건 `jobsModule.ts`의 구조를 바꾸는 일이라 **이번 범위가 아니다.**
> 배포 방식을 정할 때 함께 판단한다.

### B. 하이브리드 — PaaS + 관리형 Postgres + S3 호환 스토리지 + CDN

상시 컨테이너를 돌리는 PaaS(Fly.io·Railway·Render 등) + 같은 리전의 관리형 Postgres +
egress 무료 오브젝트 스토리지 + CDN.

- **축 1·3 최상.** Dockerfile 하나로 배포가 나가고 egress를 0으로 고정할 수 있다
- 벤더가 2~3곳으로 나뉜다 (스토리지가 되돌릴 수 있는 결정이라 부담은 작다)
- **축 0을 후보별로 반드시 확인해야 한다** — 특히 Postgres의 direct connection 지원

### C. 국내 벤더 (NCP / Kakao Cloud)

- **축 2·5 최상.** 국내 리전이라 국외이전 고지가 필요 없고 RTT가 가장 짧다
- 문서·생태계·IaC 성숙도가 열세라 축 3이 A와 B 사이

### D. 올인원 Postgres + Storage 플랫폼 (Supabase류)

- 축 3 좋음
- **축 0이 선행 조건이다** — pooler를 우회한 direct connection이 되는지 먼저 확인.
  안 되면 pg-boss가 깨지므로 그 시점에 탈락

### ❌ 탈락: 서버리스·edge 일원화 (Vercel Functions, Cloudflare Workers 등)

판단 1의 필터에 걸린다. 인프로세스 cron이 멈추고 NestJS 데코레이터 메타데이터가 안 돈다.
**"싸고 빠르다"는 이유로 다시 올라오지 않게 여기 적어둔다.**

---

## ⚠️ GCP 프로젝트를 어느 조직에 둘 것인가 — 벤더보다 되돌리기 어려운 결정

**CUTIN은 회사 제품이 아니라 개인·사이드 프로젝트다** (2026-08-14 확인).
그런데 회사가 이미 GCP를 쓰고 있어 "회사 GCP에 만들어두고 나중에 개인 계정으로 뺀다"는 안이 나왔다.
**조사 결과 그 경로가 막혀 있다.**

| 이관 방향 | 가능 여부 |
| --- | --- |
| 조직 → **다른 조직** | ⭕ 지원 (`gcloud beta projects move`). 단 **소스 조직에서 `roles/resourcemanager.projectMover`를 받아야** 하므로 회사 관리자 승인이 필요하다 |
| 조직 → **조직 없음** | ❌ **셀프서비스 불가.** Google Cloud Customer Care 문의 경로뿐이다 |

**개인 GCP 계정(개인 Gmail)은 기본이 "조직 없음"이다.** 즉 가장 자연스러운 시나리오가
정확히 지원되지 않는 경로다. 그리고 지원되는 방향(조직→조직)조차 회사 관리자의 협조가 전제라,
**개인 프로젝트의 인프라 통제권이 회사와의 관계에 종속된다.**

### 결정: 처음부터 개인 소유로 만든다

**`getcutin.app` 도메인으로 Cloud Identity 무료 등급 조직을 만들고, 그 안에 CUTIN 프로젝트를 둔다.**

- **이관이 아예 필요 없다.** 리스크를 회피가 아니라 제거로 없앤다
- 소유권이 처음부터 명확하고 **Apple 개인 계정 결정과 정합**된다
  (회사 GCP + 개인 Apple 계정은 소유 주체가 둘로 쪼개지는 조합이었다)
- 나중에 회사 제품이 되면 **조직 → 조직**이라 지원되는 방향이다
- 개인 Gmail로 "조직 없음"에 만드는 것보다 낫다 — 그쪽도 나중에 조직에 넣을 수는 있지만
  그동안 조직 정책·폴더 같은 관리 기능을 못 쓴다

**비용:** 신규 계정 $300 크레딧(90일) + 무료 등급으로 MVP 초기는 대체로 충분하다.
"프로젝트는 개인 조직, 결제 계정만 회사 것"도 기술적으로는 가능해 보이나
**확정 검증하지 못했고 사내 승인 문제이기도 하다** — 필요하면 별도 확인한다.

---

## 권고

### 1단계 — 스토리지·CDN: **GCS + Cloud CDN으로 일원화** (2026-08-14 결정)

벤더를 하나로 유지해 IAM·로그·청구를 한곳에 모으는 쪽을 택했다.
**대가는 egress 비용이다** — 아래 재검토 트리거를 함께 둔다.

#### 재검토 트리거 — 이 조건에 닿으면 스토리지만 R2로 분리한다

egress가 총액을 지배하는 구조는 벤더를 바꿔도 그대로다.
**스토리지는 되돌릴 수 있는 결정**(판단 2)이고 어댑터가 `STORAGE` 토큰 하나 뒤에 있으므로,
분리 비용은 낮게 유지된다.

- **월 egress 요금이 나머지 인프라 비용을 넘어설 때**
- 또는 **월 전송량이 1TB를 넘을 때** — R2 기준 egress $0이므로 차이가 즉시 체감된다
- 그때 바꾸는 것은 `storageModule.ts`의 팩토리와 env 뿐이다. **미리 대비해 추상화를 늘리지 않는다**

<details>
<summary>참고: 채택하지 않은 기본안 (Cloudflare R2 + Cloudflare CDN)</summary>

**요건이었던 것:** S3 호환 + egress 0원 또는 초저가 + 한국 PoP + 커스텀 도메인 + 퍼블릭 읽기 지원

근거:

- **egress가 총액을 지배하는데 그걸 0으로 고정하면 비용이 예측 가능해진다.**
  R2는 egress $0.00/GB, 저장 $0.015/GB·월, Class A(쓰기·목록) $4.50/백만,
  Class B(읽기) $0.36/백만이다 (2026-08 조회 기준 — **계약 전 공식 페이지로 재확인할 것**).
  무료 한도는 저장 10GB, Class A 100만, Class B 1000만 회/월
- **S3 호환**이라 나중에 S3·NCP로 옮겨도 어댑터가 같다 (판단 2)
- **앱 서버가 어디에 있든 붙는다** — 호스팅 결정을 기다릴 필요가 없다

**확인이 필요한 것:** 한국 PoP 커버리지, 커스텀 도메인 + 퍼블릭 버킷 설정 방법,
데이터 저장 위치(축 5의 국외이전 고지 판단).

**확인이 필요했던 것:** 한국 PoP 커버리지, 커스텀 도메인 + 퍼블릭 버킷 설정 방법, 데이터 저장 위치.

</details>

### 2단계 — 호스팅·Postgres (GCP 안에서 고른다)

**Postgres는 Cloud SQL for PostgreSQL, 리전은 `asia-northeast3`(서울).**
direct connection이 되므로 축 0을 통과한다.

**컨테이너 런타임은 아직 열려 있다.** 위 "축 0의 함정"대로 Cloud Run을 기본 설정으로 쓰면
리마인더가 조용히 죽으므로, 아래를 실제 요금으로 비교해서 정한다.

| 후보 | 축 0 상시 실행 | 축 3 첫 배포 | 축 6 마이그레이션 실행 자리 | 비고 |
| --- | --- | --- | --- | --- |
| Cloud Run + `--no-cpu-throttling --min-instances=1` | ⭕ (설정 필수) | 쉬움 | Cloud Run Jobs | 상시 VM에 준하는 비용 |
| GCE VM (e2-small 등) | ⭕ | 보통 | SSH 또는 startup script | 가장 단순·예측 가능 |
| GKE Autopilot | ⭕ | 어려움 | Job 리소스 | 현재 규모에 과하다 |

> ⚠️ 요금은 **공식 가격 페이지로 확인해서 채운다.** 기억이나 블로그로 쓰지 않는다.
> 이 축에서 틀리면 Cloud Run을 고른 근거가 통째로 무효가 된다.

---

## 확정 후 추가할 환경변수

**지금 코드에 넣지 않는다.** 읽는 코드가 없는 변수는 준비가 아니라 거짓 신호이고,
필수로 넣으면 `env.ts`가 파싱 실패로 부팅을 깨뜨린다. 어댑터 구현 PR에서 함께 들어간다.

GCS를 **S3 호환 XML API**로 붙이므로 변수 이름은 S3 계열을 그대로 쓴다
(나중에 R2로 분리해도 이름이 안 바뀐다 — 재검토 트리거의 비용을 낮추는 부수 효과다).

```
STORAGE_DRIVER=s3                                  # local | s3
S3_ENDPOINT=https://storage.googleapis.com
S3_BUCKET=
S3_REGION=asia-northeast3
S3_ACCESS_KEY_ID=                                  # GCS HMAC 키
S3_SECRET_ACCESS_KEY=                              # GCS HMAC 시크릿
```

> ⚠️ **GCS HMAC 키는 서비스 계정에 발급한다.** 조직 정책으로 서비스 계정 키 생성이 막혀 있으면
> 여기서 걸린다 — 개인 조직으로 만들면 우리가 정책을 통제하므로 문제되지 않는다.

`MEDIA_BASE_URL`은 예외로 **이미 들어가 있다** — 벤더와 무관하게 지금 읽는 코드가 있기 때문이다
(CDN 도메인. 미설정 시 `PUBLIC_BASE_URL`로 폴백).

### 이미 끝난 코드 준비

벤더가 무엇으로 정해지든 필요한 것은 미리 해뒀다. 어댑터 구현 PR이 이것들을 함께 들고 오지 않아도 된다.

- `StorageService.createUploadTarget`이 **async**다 — 서명 URL 발급은 어느 벤더 SDK에서도 비동기다
- `url()`은 **동기를 유지한다** — 서명 GET URL로 가면 매핑 함수가 전부 async가 되어
  `toPage`를 타고 모든 목록 엔드포인트로 번지고, 요청마다 URL이 달라져 CDN·클라이언트 캐시가
  무효화돼 축 1과 정면 충돌한다. 게다가 이건 벤더 요구가 아니라
  **이미 정해진 "추측 불가 키 + 퍼블릭 읽기" 정책의 반전**이므로 별개 결정으로 다룬다
- 업로드 베이스(`PUBLIC_BASE_URL`)와 미디어 베이스(`MEDIA_BASE_URL`)가 분리돼 있고,
  테스트가 둘을 다른 도메인으로 돌려 분리가 깨지지 않는지 검증한다
- ⚠️ **`@fastify/static`은 미사용처럼 보이지만 지우면 안 된다.** 소스 어디에서도 import하지 않아
  한 번 제거했다가 앱이 부팅에 실패했다. `main.ts`의 `setupOpenapi`가 부르는 `SwaggerModule.setup`이
  `/docs` UI를 서빙하려고 런타임에 로드한다 (`PackageLoader`가 없으면 에러를 던진다).
  **테스트는 이 경로를 타지 않는다** — `test/helpers/testApp.ts`가 `setupOpenapi`를 부르지 않아
  lint·typecheck·test가 전부 통과한 채로 앱만 죽는다. 의존성을 건드렸으면 `pnpm dev`로 실제 부팅을 본다.
  (미디어를 CDN이 서비스하므로 **앱이 미디어 파일을 서브하지는 않는다**. 이건 Swagger UI 자산 얘기다)

---

## 먼저 정해야 할 것

**각 항목에 기한과 무응답 시 기본값을 적는다.** 이게 없으면 이 문서도 "보류"로 끝난다.

1. ~~스토리지·CDN 벤더~~ — **GCS + Cloud CDN으로 일원화 확정 (2026-08-14).** 재검토 트리거는 위 1단계
2. ~~호스팅 클라우드~~ — **GCP 확정 (2026-08-14).** 리전 `asia-northeast3`, Postgres는 Cloud SQL
3. ~~국내 리전 요건~~ — **서울 리전이므로 국외이전 고지가 불필요해졌다.** 축 5 해소
4. **GCP 조직을 새로 만들 것인가** — 위 "GCP 프로젝트를 어느 조직에" 참조.
   회사 조직에 만들면 개인 계정으로 빼는 셀프서비스 경로가 없다.
   **기한: 프로젝트 생성 전 (되돌리기 가장 비싼 결정).**
   무응답 시 기본값 **`getcutin.app` Cloud Identity 조직을 새로 만들어 그 안에 생성**
5. **컨테이너 런타임** — Cloud Run(`--no-cpu-throttling --min-instances=1`) vs GCE VM.
   실제 요금으로 2단계 표를 채운 뒤 정한다.
   **기한: Dockerfile 작성 전.** 무응답 시 기본값 **GCE VM** — 축 0을 설정 실수로 깨뜨릴 여지가 없다
6. **egress 산정 가정값** — 1인당 월 포스트 수, 평균 이미지 크기, 조회당 이미지 수.
   벤더는 정해졌지만 **재검토 트리거를 언제 당길지 판단하려면 여전히 필요하다.**
   **기한: 스테이징 배포 후 실측으로 대체 가능.** 무응답 시 기본값:
   포스트 4건/월, 이미지 1.5MB, 조회당 20장으로 **가정을 명시하고 진행**

## 권장 순서

1. **`getcutin.app` 등록 → Cloud Identity 조직 생성 → CUTIN 프로젝트 생성**
   도메인 하나가 DNS와 GCP 조직 양쪽의 입구다. **가장 먼저, 그리고 되돌리기 가장 비싸다**
2. ~~apex 도메인 확정~~ — **`getcutin.app`으로 확정 (2026-08-14).**
   DNS 네임서버는 Cloudflare로 위임한다 (`clientEnvironments.md` §1.1·§1.2).
   **GCP를 쓰더라도 DNS는 Cloudflare로 둔다** — 벤더 중립이라 나중에 CDN을 바꿔도 레코드만 고치면 된다
3. **GCS 버킷 + HMAC 키 발급** → 스토리지 어댑터 구현 PR (호스팅을 기다리지 않는다)
4. **컨테이너 런타임 확정** (2단계 표) → Dockerfile + Cloud SQL + 스테이징 배포
5. **마이그레이션 실행 훅 + 시크릿 주입** (축 6)
6. **CD 워크플로** — 스테이징이 손으로 한 번 뜬 뒤에 자동화한다
7. **고아 미디어·스토리지 파일 정리 잡** — `retentionJob.ts`의 미완 과제.
   스토리지가 유료가 되는 순간부터 비용이 새기 시작한다

## 참고

- [Move a project — Resource Manager](https://docs.cloud.google.com/resource-manager/docs/moving-projects-folders)
  (조직 → 조직 없음은 셀프서비스 불가)
- [Migrate projects between organizations — Resource Manager](https://docs.cloud.google.com/resource-manager/docs/project-migration)
- [Billing settings for services — Cloud Run](https://docs.cloud.google.com/run/docs/configuring/billing-settings)
  (요청 기반 vs 인스턴스 기반 CPU 할당)
- [Use Cloud Run "always allocated CPU" for background work — Google Cloud Blog](https://cloud.google.com/blog/topics/developers-practitioners/use-cloud-run-always-cpu-allocation-background-work)
- 채택하지 않은 R2: [Cloudflare R2](https://www.cloudflare.com/products/r2/) ·
  [단가 정리](https://egresscost.com/cloudflare/)
- 탈락 필터의 근거: `src/jobs/jobsModule.ts` (인프로세스 cron), pg-boss advisory lock
