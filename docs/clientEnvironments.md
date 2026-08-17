# 클라이언트 환경·계약 (iOS)

**상태:** 서버 준비 완료, 도메인 확정 — 2026-08-14
**결정권자 확인 필요:** 아래 "먼저 정해야 할 것" 1번(bundle id)

`Release.xcconfig`가 막혀 있는 이유는 벤더가 안 정해져서가 아니라 **호스트네임이 안 정해져서**다.
DNS는 우리가 소유하므로 도메인 스킴은 벤더 결정과 무관하게 지금 확정할 수 있고,
벤더가 정해지면 CNAME이 가리키는 곳만 바뀐다. 이 문서는 **지금 확정해서 iOS에 넘기는 것**과
**벤더 확정 전에는 확정할 수 없는 것**을 나눈다.

관련 문서: [`infraVendors.md`](./infraVendors.md) (벤더 결정) · [`appleAccount.md`](./appleAccount.md) (APNs·계정)

---

## 1. 환경과 도메인

**apex 도메인은 `getcutin.app`으로 확정했다 (2026-08-14).** 아직 등록 전이라 DNS는 붙지 않았지만,
호스트네임은 이 표로 고정이므로 xcconfig를 지금 채워도 된다.


| 환경         | API                            | 미디어(CDN)                       | 비고                                   |
| ---------- | ------------------------------ | ------------------------------ | ------------------------------------ |
| Local      | `http://localhost:3000`        | 같음                             | `MEDIA_BASE_URL` 미설정 시 API와 같은 값을 쓴다 |
| Staging    | `https://api-stg.getcutin.app` | `https://cdn-stg.getcutin.app` |                                      |
| Production | `https://api.getcutin.app`     | `https://cdn.getcutin.app`     |                                      |


### 왜 `cutin.app`이 아닌가

`cutin.app`은 이미 제3자가 보유 중이다 — NS가 `wixdns.net`이고 A 레코드가 응답한다(Wix 호스팅).
`cutin.io`는 `.io`가 ISO 3166 기반 ccTLD인데 2024-10 영국·모리셔스 차고스 협정 이후 코드 유지가
불확실해 5년 단위 리스크가 있다. `.app`은 TLD 전체가 HSTS preload라 평문 접속이 원천 차단되는 이점도 있다.

### DNS 관리 주체

**등록기관과 DNS를 같은 곳에 두지 않는다.** 등록은 어디서 하든, **DNS는 Cloud DNS**에 둔다 —
GCP로 일원화했으므로 로드밸런서·인증서·CDN이 같은 프로젝트 안에서 맞물린다.
apex 소유자는 **개인 계정**이다(회사 자산으로 묶지 않는다. 근거는 `infraVendors.md`).


- **API 도메인과 미디어 도메인은 별개다.** 서버는 이미 두 값을 분리해서 들고 있고
(`PUBLIC_BASE_URL` / `MEDIA_BASE_URL`), 테스트가 둘을 다른 값으로 돌려 분리가 깨지지 않는지 검증한다.
- **포스트 공유 링크(`/p/{postId}`)는 API 도메인을 쓴다.** 웹 랜딩이므로 CDN이 아니다.
나중에 별도 도메인으로 갈라야 할지는 열어둔 물음표다.

## 2. 빌드 configuration 3개 【권고】

**Debug / Staging / Release**, 그리고 **Staging은 별도 bundle id**를 쓴다.

Debug/Release 2개로는 안 되는 이유:

1. **TestFlight는 Release configuration으로 빌드된다.** 2개만 두면 TestFlight 빌드가
 프로덕션을 가리킬 수밖에 없어 **스테이징 QA가 불가능하다.**
2. bundle id가 다르면 한 기기에 두 앱을 나란히 설치할 수 있어 QA가 실기기 하나로 돈다.
3. 빌드마다 `aps-environment`가 명확해져 아래 §4의 `pushEnvironment` 보고가 추측이 아니게 된다.


| Configuration | API base         | bundle id (기본안)      | `aps-environment` | `pushEnvironment` |
| ------------- | ---------------- | -------------------- | ----------------- | ----------------- |
| Debug         | Local 또는 Staging | `app.getcutin.ios.dev` | `development`     | `sandbox`         |
| Staging       | Staging          | `app.getcutin.ios.stg` | `development`     | `sandbox`         |
| Release       | Production       | `app.getcutin.ios`     | `production`      | `production`      |


TestFlight·App Store 빌드는 Release configuration + `production`이다.

bundle id는 **개인 소유 도메인 `getcutin.app`의 역DNS**를 쓴다. 소유 주체를 개인·사이드 프로젝트로
확정했으므로 회사 도메인을 쓰지 않는다 — bundle id는 앱 수명 내내 바꿀 수 없다.
아직 확정은 아니다(아래 "먼저 정해야 할 것" 1번).

## 3. 네트워크 규칙

- **HTTPS 전용. ATS 예외를 넣지 않는다.** API·CDN 모두 유효한 인증서를 쓴다.
`NSAppTransportSecurity` 예외를 plist/xcconfig에 넣으면 심사에서 사유를 요구받는다.
- **서버가 내려준 URL은 절대 URL이며 그대로 쓴다.** `media.url`, 업로드 목적지, 공유 링크 모두
baseURL과 **조립하지 않는다.** 조립하면 CDN 도메인이 갈라지는 순간 전부 깨진다.
- 오류 응답은 항상 `{ error: { code, message, details? } }` 한 모양이다.
분기는 `message`가 아니라 **`code`로 한다** — `code`는 계약이고 함부로 바꾸지 않는다.
- **`openapi.json`이 유일한 계약이다.** 변경은 서버 PR로 통보한다.

## 4. 디바이스 등록 — `POST /devices` 계약 변경 ⚠️

**`pushEnvironment`가 required 필드로 추가됐다.** iOS codegen이 깨지므로 반영이 필요하다.

```jsonc
// POST /devices
{
  "platform": "ios",
  "pushToken": "...",
  "pushEnvironment": "sandbox" | "production",  // ← 신규, 필수
  "timezone": "Asia/Seoul"
}
```

응답(`DeviceDto`)에도 `pushEnvironment`가 함께 내려간다 — 서버가 어느 환경으로 기록했는지
클라이언트가 바로 확인할 수 있게 하기 위해서다.

### 값을 어떻게 정하는가

`embedded.mobileprovision`의 `aps-environment` 엔트리를 읽는다.

- `development` → `"sandbox"`
- `production` → `"production"`
- **프로비저닝 프로파일이 없는 빌드(App Store·TestFlight) → `"production"`**
- 시뮬레이터 → `"sandbox"`

§2의 3-configuration을 쓰면 빌드별로 이 값이 일의적으로 정해진다.

### 왜 선택 항목이 아닌가

APNs 토큰은 한 환경에서만 유효하다. sandbox 토큰을 production 엔드포인트로 보내면
`BadDeviceToken`이 오고 푸시가 조용히 전부 실패한다. 선택 항목으로 두면 클라이언트가
안 보낸 디바이스가 조용히 production으로 등록돼 원인이 드러나지 않는다.
**서버 전역 설정으로 대신할 수도 없다** — TestFlight 빌드(production 토큰)를 스테이징 서버에 붙이면
한 서버에 두 환경 토큰이 섞이기 때문이다.

### 반영 순서

앱이 아직 스토어에 없으므로 **단계적 롤아웃 없이 한 번에 required로 간다.**
서버 머지와 iOS 반영을 같은 스프린트에 묶는다. 계약이 두 벌로 갈라지는 기간이 없다.

## 5. 미디어 업로드 — 지금 이 구조로 짜두면 벤더 확정 시 변경이 0이다

현재 흐름(서버가 바이트를 중계)과 서명 URL 흐름은 **클라이언트 코드가 같다.**
아래 규칙만 지키면 벤더가 정해져도 iOS는 손댈 게 없다.

```
1) POST /media/uploads        → { mediaId, url, method, headers }
2) 그 url에 그 method로 바이트 전송, 응답의 headers를 그대로 세팅
3) POST /media/{mediaId}/complete  → 미디어가 ready가 되고 url이 내려온다
```

**2단계에서 반드시 지킬 것:**

- **업로드 대상 호스트를 가정하지 않는다.** 지금은 우리 API 도메인이지만
서명 URL로 바뀌면 벤더 도메인이 된다. 응답의 `url`을 그대로 쓴다.
- **우리 `Authorization: Bearer`를 붙이지 않는다.** S3 호환 스토리지에 SigV4 서명과
`Authorization` 헤더가 함께 오면 요청이 거절된다. (현재 로컬 구현은 붙여도 통과하지만,
붙여둔 채로 두면 벤더 전환 시 전부 깨진다.)
- **응답의 `headers` 외에 아무 헤더도 추가하지 않는다.** 서명에 포함된 헤더 집합이 달라지면
서명 검증이 실패한다.

**제약:**

- 업로드 상한 **15MB**, 초과 시 `413` (`code: PAYLOAD_TOO_LARGE`)
- 허용 MIME: `image/jpeg`, `image/png`, `image/heic`
- `complete`를 호출해야 포스트에 붙일 수 있다. 서버가 바이트 도착을 확인한 뒤에만 `ready`가 된다

## 6. 미디어 조회 — URL이 곧 권한이다

`GET /media/content/*`는 **인증을 요구하지 않는다.** 저장 키에 소유자 id와 미디어 id(둘 다 UUID)가
들어가 추측할 수 없다는 근거로 의식적으로 정한 정책이다. 따라서:

- **이미지 URL을 로그·분석 이벤트·외부 공유에 그대로 흘리지 않는다.**
- URL이 안정적이므로 **캐시는 마음껏 해도 된다.** (서명 URL로 바꾸지 않는 이유 중 하나가
캐시 무효화와 전송 비용이다 — 근거는 `infraVendors.md`.)

---

## 아직 확정할 수 없는 것

벤더는 **GCP + GCS로 확정**됐지만(`infraVendors.md`), 아래는 실제로 구성해 봐야 값이 나온다.
문서에 "미정"으로 남긴다 — iOS가 여기에 의존하는 코드를 미리 쓰지 않게 하는 것이 목적이다.

- CDN 도메인의 CNAME 대상과 인증서 발급 시점 (Cloud CDN 구성 후 확정)
- **업로드 대상의 실제 호스트.** GCS 서명 URL이면 `storage.googleapis.com`이 되겠지만,
확정 전까지 가정하지 않는다 → §5의 "호스트를 가정하지 않는다"가 그래서 중요하다
- **서명 URL의 TTL과 `UploadTarget.expiresAt` 필드.** 지금은 추가하지 않는다 —
TTL 값이 없으면 채울 수 없고, optional 필드 추가는 codegen에 비파괴적이라 나중에 넣어도 된다.
다만 **목적지를 발급받고 오래 붙들고 있지 않는다**는 전제로 짜둘 것
- 이미지 리사이즈·썸네일 파라미터 규약 (2차)

## 먼저 정해야 할 것

1. **bundle id 3종** — §2 표. Apple App ID 생성과 함께 정한다 (`appleAccount.md` 참조).
 **기한: APNs 키 발급 전.** 무응답 시 기본값 `app.getcutin.ios` / `.stg` / `.dev`
2. **iOS의 `pushEnvironment` 반영 시점** — §4. **기한: 다음 스프린트 내**

~~apex 도메인과 DNS 관리 주체~~ — **`getcutin.app` + Cloud DNS로 확정 (2026-08-14).** §1 참조.

