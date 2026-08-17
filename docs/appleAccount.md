# Apple Developer 계정 · APNs

**상태:** 계정 형태 결정 완료 (**개인 계정 유지**) — 2026-08-14 · APNs 키 발급 대기
**결정권자 확인 필요:** 아래 "먼저 정해야 할 것"

프론트엔드에서 "Apple Developer 계정·APNs 키가 서버 APNs 구현의 선행 조건"이라는 요청이 올라왔다.
조사 결과 **선행 조건의 범위가 생각보다 좁다.**

> **핵심: 개인(Individual) 계정으로도 APNs 인증 키(`.p8`) 발급에 제약이 없다.**
> 서버 APNs 구현에 계정 형태는 걸림돌이 아니다.

**결정: 개인(Individual) 계정으로 간다.** 조직 계정 전환은 착수하지 않는다
(근거와 재검토 조건은 아래 "조직 계정 — 보류" 참조).

**서버 APNs 어댑터는 구현이 끝났다** (`src/shared/push/apnsPushService.ts`).
따라서 푸시가 실제로 나가기까지 남은 것은 **키 발급 행정 하나뿐**이고, 오늘 끝낼 수 있다.

관련 문서: [`clientEnvironments.md`](./clientEnvironments.md) (bundle id·빌드 환경)

---

## APNs 키 발급 — 전부 행정 · 오늘 가능

### 절차

1. **App ID 생성** — Certificates, Identifiers & Profiles → Identifiers →
   Push Notifications capability 활성화.
   bundle id는 [`clientEnvironments.md`](./clientEnvironments.md) §2의 3-configuration과 함께 정한다
   (Staging용 별도 bundle id 포함).
2. **APNs 인증 키 발급** — Keys → 새 키 → **Apple Push Notifications service (APNs)** 체크 →
   **`.p8` 다운로드**
3. **Key ID · Team ID · bundle id를 함께 기록**

### 주의 — 되돌릴 수 없는 것들

- **`.p8`은 한 번만 다운로드된다.** Apple이 보관하지 않아 재다운로드가 불가능하다.
  받는 즉시 시크릿 저장소로 옮긴다. 잃어버리면 키를 폐기하고 새로 만드는 수밖에 없다
- **계정당 APNs 키는 최대 2개다.** 시험 삼아 여러 개 만들어 한도를 태우지 않는다
- **`.p8` 하나가 sandbox·production 양쪽에 모두 쓰인다.** 환경마다 키를 따로 만들지 않는다.
  다른 것은 엔드포인트 호스트뿐이다:
  - sandbox: `api.sandbox.push.apple.com`
  - production: `api.push.apple.com`
- 인증 키는 **만료되지 않고**, 한 키가 그 계정의 모든 앱에 쓰인다
  (인증서(`.p12`) 방식과 달리 연 1회 갱신이 없다 — 그래서 `.p8`을 쓴다)

### 완료 판정

**`.p8` + Key ID + Team ID + bundle id 4종이 시크릿 저장소에 들어간 것.**
이 시점에 서버 APNs 구현이 언블록된다.

### 서버가 쓸 환경변수 — 구현 완료, 값만 넣으면 된다

재발급 대상이므로 **전부 환경변수로 다루고 코드·저장소에 박지 않는다.**
(키 분실·폐기, 그리고 나중에 조직 계정으로 옮기게 되면 Team ID까지 바뀐다.)

```
APNS_KEY_ID=
APNS_TEAM_ID=
APNS_PRIVATE_KEY=      # .p8의 PEM 내용
APNS_BUNDLE_ID=        # apns-topic 헤더로 쓴다
```

- **넷을 다 채우면 실제 APNs로 발송하고, 다 비우면 로그만 남긴다.**
  `src/shared/push/pushModule.ts`가 이 분기를 한다
- **일부만 채우면 부팅이 실패한다** (`config/env.ts`의 refine). 의도적이다 —
  조용히 로깅 구현으로 떨어지면 "설정했는데 푸시가 안 온다"가 되고, 그건 로그에도 안 남는다
- ⚠️ **`APNS_PRIVATE_KEY`의 개행 처리.** 한 줄 env로 넣으면 `\n`이 이스케이프되므로 복원이 필요한데,
  `pushModule.ts`가 이미 `\\n` → 개행 치환을 한다. 파일로 마운트한 PEM은 그대로 통과한다

### ⚠️ 환경(sandbox/production)은 환경변수가 아니다

**디바이스 토큰별 컬럼이다** (`devices.pushEnvironment`). 구현자가 `APNS_ENVIRONMENT`를 추가하지 않도록
여기 못박아 둔다.

APNs 토큰은 한 환경에서만 유효하고, 서버 전역 설정으로 두면
**TestFlight 빌드(production 토큰)를 스테이징 서버에 붙이는 순간 조용히 전부 실패한다.**
"production으로 보내고 실패하면 sandbox로 재시도"도 안 된다 — `BadDeviceToken`을
"환경 불일치"와 "폐기 대상"으로 구분하지 못해 **유효한 토큰을 영구 폐기**할 위험이 있다.

서버는 이미 이 컬럼을 들고 있고, `PushMessage.pushEnvironment`로 두 발송 경로
(슬롯 리마인더 · 즉시 알림) 모두에 실려 나간다. 어댑터(`apnsPushService.ts`)는 이 값으로
`api.sandbox.push.apple.com` / `api.push.apple.com` 중 하나를 골라 환경별로 연결을 따로 잡는다.

---

## 조직 계정 — 보류 (2026-08-14 결정)

**개인 계정으로 가기로 했다.** 조사 결과를 버리지 않고 남기는 이유는,
아래 비용이 사라지는 게 아니라 **운영 방식으로 흡수해야 하는 것**이고,
재검토 조건에 걸리면 다시 꺼내야 하기 때문이다.

### 개인 계정을 택하면서 감수하는 것

| 항목 | 결과 | 흡수 방법 |
| --- | --- | --- |
| 개발자 표기명 | **App Store에 개인 실명이 노출된다** | 감수. 바꾸려면 조직 전환뿐이다 |
| 포털 접근 권한 | Certificates, Identifiers & Profiles를 **Account Holder만** 접근할 수 있다 — 팀 멤버에게 나눠줄 수 없다 | ⚠️ 아래 "단일 보유자 리스크" |
| 앱 소유권 | 개인에게 묶인다 | 감수 |

### ⚠️ 단일 보유자 리스크 — 개인 계정에서 새로 생기는 운영 문제

포털 접근이 한 사람뿐이라 **그 사람이 부재하면 키·프로파일·인증서 작업이 전부 막힌다.**
조직 계정이었다면 다른 멤버가 대신할 수 있는 일이다. 그래서 아래가 조직 계정일 때보다 **더** 중요해진다.

- **`.p8`은 발급 즉시 시크릿 저장소에 넣는다.** 개인 노트북에**만** 두지 않는다.
  Apple이 재다운로드를 제공하지 않으므로, 파일을 잃으면 Account Holder만 재발급할 수 있고
  키 한도는 2개다
- **Key ID · Team ID · bundle id도 같은 항목에 함께 적어둔다.** `.p8`만 있으면 쓸 수 없다
- **Account Holder가 누구인지, Apple ID 복구 수단(2FA 기기·복구 연락처)이 무엇인지 문서화한다**

#### 보관 방법 (권고)

**1차 보관: 비밀번호 관리자(1Password·Bitwarden 등)에 파일 첨부 + 위 3개 값을 같은 항목에 메모.**
기기 초기화·분실에도 살아남고, 팀이 생기면 공유 볼트로 옮기면 된다.
비밀번호 관리자를 쓰지 않는다면 차선은 macOS 디스크 유틸리티로 만든 **암호화 `.dmg`**
(비밀번호는 키체인에).

**로컬 작업 사본이 필요하면** 프로젝트 디렉터리 **밖**에 둔다:

```
~/.secrets/cutin/AuthKey_XXXXXXXXXX.p8    # 디렉터리 700, 파일 600
```

**금지:** 프로젝트 디렉터리 · iCloud Drive/Dropbox 평문 동기화 · 슬랙·카톡 DM · 이메일 첨부.
저장소에는 안전망으로 `.gitignore`에 `*.p8`·`*.p12`·`*.mobileprovision`을 걸어두었다.

### 재검토 조건 — 아래가 생기면 다시 꺼낸다

1. **개발자 표기명이 개인 실명으로 나가는 것이 문제가 될 때** (투자·제휴·브랜딩)
2. **포털 작업을 두 사람 이상이 해야 할 때** — 단일 보유자 리스크가 실제로 터졌을 때
3. **법인 설립이 끝났을 때** — Organization 멤버십은 법인 실체와 D-U-N-S 매칭을 전제한다

### 재검토 시 알아둘 것 (조사 결과 보존)

- **D-U-N-S 번호**가 필요하다. Apple 전용 조회 경로가 있고 무료지만,
  법인 등록 정보와 문자열 단위로 일치해야 하고 발급에 수일~2주 걸린다
- **전환은 계정 설정에서 직접 못 한다.** Apple Developer Program Support에 Contact Us로 요청하면
  담당자가 수 영업일 내 전화·메일로 검증한다
- **Team ID 유지 여부는 Apple 응답으로 확인해야 한다.** 전환 경로라 유지되는 것이 일반적이지만
  확답 전에는 가정하지 않는다. 유지되지 않아 신규 등록 + App Transfer가 되면
  **App Transfer는 앱이 App Store에 게시된 뒤에만 가능하다**
- Team ID가 바뀌면 **APNs 키도 재발급 대상**이다 — 그래서 4종을 전부 환경변수로 다룬다

> **출시 후로 미룰수록 비싸진다.** 위 조건 중 하나라도 보이면 출시 전에 판단하는 것이 낫다.

---

## Sign in with Apple — 심사 리젝 리스크

### 사실관계

- 서버는 현재 **google·kakao만** 지원한다 (`oauthVerifier.ts`, `identities.ts`의 `oauthProviders`)
- `CUTIN-FEATURES.md` §2.1과 §1 미결#3 확정 사항에 **Apple 로그인이 없다**

**심사 가이드라인 4.8 (Login Services)** 는 서드파티 소셜 로그인으로 주 계정을 만드는 앱에
**동등한 대안 로그인**을 요구한다. 그 대안은 세 가지를 만족해야 한다:

1. 수집을 **이름과 이메일로 제한**
2. 사용자가 **이메일을 비공개로 유지**할 수 있음
3. 광고 목적으로 앱 내 상호작용을 추적하지 않음

2024년 개정으로 "Sign in with Apple을 반드시 쓸 것"은 아니게 됐지만,
**구글·카카오 모두 이메일 마스킹(2번)을 제공하지 않으므로 실질적으로 Sign in with Apple이 답이다.**
CUTIN은 예외 조항(자체 계정 시스템 전용 · 교육/기업용 · 정부 발급 ID · 특정 서드파티 서비스 클라이언트)에
해당하지 않는다.

### 언제 다루는가

**결정은 지금, 구현은 첫 심사 제출 전 스프린트.**

지금 결정해야 하는 이유는 서버 작업량이 아니라 **iOS 로그인 화면 디자인과 온보딩 플로우가 걸려 있기 때문**이다.
리젝을 맞고 화면을 다시 그리면 출시가 통째로 밀린다.

### 도입 시 서버 작업 규모

- `identities.ts`의 `oauthProviders`에 `'apple'` 추가 (text enum이라 마이그레이션 1건)
- `oauthVerifier.ts`에 `verifyApple` 추가 — issuer `https://appleid.apple.com`,
  JWKS `https://appleid.apple.com/auth/keys`, audience = bundle id.
  구조가 `verifyGoogle`과 같아 추가 자체는 자연스럽다
- `APPLE_CLIENT_ID` 환경변수

### ⚠️ 진짜 걸림돌은 도메인 정책 충돌이다

`CLAUDE.md`의 확정 정책은 **"동일 이메일이면 계정을 자동 연결한다"** 인데,
Apple의 **Private Email Relay**(`@privaterelay.appleid.com`)는 사용자가 실제 이메일을 감춘 값이고
**앱마다 다르다.** 이 값을 연결 키로 쓰면 절대 매칭되지 않거나 잘못 매칭된다.

카카오의 "이메일이 없으면 연결하지 않고 새 계정을 만든다"와 **같은 층의 예외가 필요하다.**

→ Apple 도입을 결정하면 `CLAUDE.md`의 "확정된 도메인 정책"과 `CUTIN-FEATURES.md` §2.2를
**함께 갱신해야 한다.** 코드만 고치면 정책 문서와 어긋난다.

---

## 먼저 정해야 할 것

1. **App ID·bundle id 3종** — `clientEnvironments.md` §2 표.
   **기한: 즉시.** 무응답 시 기본값 `app.getcutin.ios` / `.stg` / `.dev`
   — 소유 주체를 **개인·사이드 프로젝트**로 확정했으므로 회사 도메인(`io.redwit.*`)을 역DNS로 쓰지 않는다.
   bundle id는 앱 수명 내내 바꿀 수 없고, 나중에 소유권 다툼의 근거로 읽힐 수 있다
2. **`.p8` 보관처** — 보관 방법은 위에 정리했다. 남은 건 **어느 비밀번호 관리자를 쓸 것인가** 하나다.
   한 번만 받을 수 있는 파일이라 받기 **전에** 정해야 한다.
   **기한: 키 발급 전.** 무응답 시 기본값: **암호화 `.dmg` + `~/.secrets/cutin/`**
   (단, 이건 기기 분실에 취약하므로 임시 방편으로만 본다)
3. **Account Holder와 계정 복구 수단을 문서화할 사람** — 단일 보유자 리스크의 완화책.
   **기한: 키 발급과 함께.** 무응답 시 기본값: 키를 발급한 사람이 곧 문서화 책임자
4. ~~사업자 형태 (법인 / 개인사업자)~~ — **개인 계정으로 확정돼 불필요해졌다 (2026-08-14).**
5. **Sign in with Apple 도입 여부** — 리젝 리스크를 감수할지, 온보딩에 넣을지.
   **기한: iOS 로그인 화면 착수 전.** 무응답 시 기본값 **도입으로 간주하고 화면을 설계**한다
   (나중에 빼는 것이 나중에 넣는 것보다 싸다)

## 권장 순서

1. **bundle id 확정** → `clientEnvironments.md` §2와 함께 (즉시)
2. **`.p8` 보관처 확정** → 발급 전에 반드시 (한 번만 받을 수 있다)
3. **App ID 생성 + `.p8` 발급 + 4종 기록** (반나절)
4. **Account Holder·계정 복구 수단 문서화** — 단일 보유자 리스크 완화
5. **APNs 어댑터 구현** — 3번 완료 즉시 가능
6. **Sign in with Apple 결정** — 심사 제출 일정에서 역산

조직 계정 전환은 이 순서에 없다. 재검토 조건에 걸리면 그때 위 "조직 계정 — 보류"를 다시 읽는다.

## 참고

- [App Review Guidelines — Apple Developer](https://developer.apple.com/app-store/review/guidelines/) (§4.8 Login Services)
- [Apple, Sign in with Apple 강제 요건 완화 (2024-01) — 9to5Mac](https://9to5mac.com/2024/01/27/sign-in-with-apple-rules-app-store/)
- [Enrollment — Apple Developer Help](https://developer.apple.com/help/account/membership/program-enrollment/)
- [Individual vs Organization 등록 차이](https://knowledgebase.getthereferral.com/knowledgebase/individual-and-organization-enrollment-apple-developer-program)
- [개인 → 조직 전환 요청 절차](https://support.shopgate.com/hc/en-us/articles/115000402111-Converting-your-Apple-Developer-Program-from-Individual-to-Organization)
