# PR 병합 · 릴리즈 자동화 (보류)

**상태:** 조사 완료, 도입 보류 — 2026-08-13
**결정권자 확인 필요:** 아래 "먼저 정해야 할 것" 참조

P5 착수를 우선하기로 해 도입은 미뤘다. 이 문서만 보고 바로 이어서 작업할 수 있게
조사 시점의 사실과 판단 근거를 남긴다.

## 왜 이 이야기가 나왔나

PR #1~#6을 머지하는 동안 **CI가 한 번도 통과한 적이 없었는데도 전부 머지됐다.**
`pnpm/action-setup`이 버전을 못 찾아 설치 전에 멈추고 있었고(#7에서 수정),
아무도 그걸 몰랐던 이유는 **CI 통과를 요구하는 장치가 없었기 때문**이다.

## 조사 시점의 저장소 상태

| 항목 | 값 | 비고 |
| --- | --- | --- |
| 브랜치 보호 · 룰셋 | **없음** | `dev`가 무방비 |
| 필수 상태 체크 | **없음** | 빨간 CI로도 머지 가능 |
| `allow_auto_merge` | `false` | 네이티브 auto-merge 꺼짐 |
| `delete_branch_on_merge` | `false` | 머지된 브랜치가 계속 쌓임 |
| 공개 범위 | **public** (조직 소유, free 플랜) | merge queue 자격의 근거 |

## 핵심 판단

**자동화보다 게이트가 먼저다.** 통과 기준이 없는 상태에서 자동 병합을 켜면
"빨간 상태로 자동 머지"가 될 뿐이다. 순서를 뒤집으면 안 된다.

## 선택지

### A. GitHub 네이티브

- **필수 체크 + PR 경유** — 실제 공백. 가장 먼저 해야 할 일
- **auto-merge** (`gh pr merge --auto`) — 체크 통과 시 자동 병합
- **merge queue** — PR을 최신 base에 다시 테스트한 뒤 병합. semantic conflict를 막는다
  - **이 저장소는 public + 조직 소유라 free 플랜에서도 쓸 수 있다.**
    private으로 바꾸면 자격을 잃는다 (Enterprise Cloud 필요)
  - 워크플로에 `merge_group:` 트리거를 반드시 추가해야 한다. 빠뜨리면 큐가 영영 안 돈다
  - 1인 개발에는 과하다. 협업자 2명 이상 + CI 1분 초과 시 재검토

⚠️ **2026년 현재 함정 두 가지**
1. **auto-merge와 ruleset의 궁합이 나쁘다.** 필수 체크를 ruleset으로 걸면 auto-merge가
   제대로 동작하지 않는다 → 이 조합을 쓸 거면 **classic branch protection**을 쓸 것
2. 2026-03부터 **모든 요건이 충족된 뒤에야** auto-merge를 켤 수 있게 바뀌었다.
   "미리 걸어두고 기다리게 하는" 용법이 깨졌다. GitHub이 수정 중이라고만 밝힌 상태

### B. 저장소 설정을 안 건드리는 방법

`workflow_run`으로 CI 성공을 받아 `gh pr merge`를 호출하는 워크플로를 직접 둔다.
조건을 100% 통제할 수 있고 플랜·공개범위 제약과 위 함정을 우회한다.
다만 **게이트가 아니라 편의 기능**이라, 브랜치 보호 없이는 웹 UI 버튼이나 직접 push를 막지 못한다.

### C. 봇 · 앱

- **[Kodiak](https://kodiakhq.com/)** — 오픈소스이고 **자체 호스팅 가능한 유일한 현역**.
  브랜치 보호 설정을 그대로 읽고, base가 밀리면 브랜치를 자동 최신화한 뒤 병합. CI 변경 불필요
- **Bors-NG** — 공개 서비스 종료(네이티브 큐에 자리를 넘김). 신규 채택 비권장
- **Bulldozer**(Palantir) — 유지보수 부진
- **Mergify / Aviator / Graphite / trunk.io** — 상용. 배칭·flaky 격리·큐 우선순위·stacked PR이
  필요할 때. 지금 규모에는 과하다

### D. 병합이 아니라 **릴리즈**를 자동화

`release/0.1.0` PR 본문을 손으로 썼는데, 그 작업 자체를 자동화할 수 있다.

| 도구 | 방식 | 규모(2026-02) |
| --- | --- | --- |
| **changesets** | changeset 파일 기반. 봇이 버전업 PR을 엶 | ~3M/주 |
| **semantic-release** | 커밋을 읽어 **PR 없이** CI에서 바로 배포 | ~2M/주 |
| **release-please** | 커밋을 읽어 **릴리즈 PR을 만들고 유지**, 머지 시 태그·릴리즈 | — |

**`release-please`가 현재 흐름과 가장 맞는다** — 사람의 확인 지점(릴리즈 PR 머지)이 남는다.

## 먼저 정해야 할 것

1. **저장소를 계속 public으로 둘 것인가.**
   상용 서비스 백엔드다. 커밋된 비밀값은 없고 `.env.example`도 자리표시자뿐이지만,
   private 전환 시 merge queue 자격이 사라져 자동화 설계가 달라진다
2. **커밋 컨벤션을 바꿀 것인가.**
   `release-please`·`semantic-release`는 Conventional Commits(`feat:`, `fix:`)를 전제한다.
   이 프로젝트는 `[FEATURE]`·`[FIX]` 형식이고 `commit-push` 스킬에도 박혀 있다.
   - 컨벤션을 바꾼다 → 도구가 그대로 돌지만 기존 커밋과 스킬을 손봐야 한다
   - **changesets를 쓴다** → 커밋 메시지를 안 읽으므로 지금 컨벤션을 그대로 둬도 된다
   - 릴리즈 PR을 계속 손으로 쓴다

## 권장 순서

1. **`dev`에 classic branch protection** — `verify` 체크 필수 + PR 경유 필수 (가장 시급)
2. **`delete_branch_on_merge: true`** — 머지된 브랜치 정리
3. **release-please 또는 changesets** — 1인 개발에서 체감 효과가 가장 큰 쪽
4. **auto-merge** (`allow_auto_merge: true`) — 위 함정 2를 확인한 뒤
5. **Renovate 또는 Dependabot + patch/minor 자동 병합** — 의존성 PR이 실제 효과가 크다.
   TypeScript·NestJS·Drizzle이 모두 활발해 곧 쌓인다
6. **merge queue** — 협업자 2명 이상 + CI 1분 초과 시. 그때 `ci.yml`에 `merge_group:` 추가

## 참고

- [Managing a merge queue — GitHub Docs](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue)
- [merge queue 가용 범위 (Enterprise Cloud 문서)](https://docs.github.com/en/enterprise-cloud@latest/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue)
- [auto-merge가 ruleset과 동작하지 않는 문제](https://github.com/orgs/community/discussions/162623)
- [auto-merge 활성화 조건 변경 (2026-03)](https://github.com/orgs/community/discussions/190610)
- [State of Merge Queues 2026 — Mergify](https://mergify.com/reports/state-of-merge-queues-2026)
- [Kodiak — Prior Art / Alternatives](https://kodiakhq.com/docs/prior-art-and-alternatives)
- [semantic-release vs changesets vs release-it (2026)](https://www.pkgpulse.com/guides/semantic-release-vs-changesets-vs-release-it-release-2026)
