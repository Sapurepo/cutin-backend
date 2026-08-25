/**
 * 공유·QR 페이지의 HTML. 로그인하지 않은 브라우저가 여는 유일한 화면이다.
 *
 * 템플릿 엔진을 두지 않는 이유: 페이지가 이것 하나고, 엔진을 넣으면 빌드 산출물에 뷰 폴더를
 * 복사하는 문제가 따라온다(`tsc`는 `.ts`만 옮긴다). 문자열 하나가 정직하다.
 *
 * **모든 사용자 입력은 `escapeHtml`을 지나야 한다.** 닉네임과 캡션은 남이 쓴 글이고, 이 페이지는
 * 인증 없이 열린다 — 빠뜨리면 그대로 XSS다.
 */

export interface SharePageData {
  nickname: string
  caption: string | null
  /** 합성된 네컷 이미지 주소 */
  composedUrl: string
  /** 촬영 중 기록된 영상 주소. 없을 수 있다. */
  motionUrl: string | null
  publishedAt: Date | null
}

const BRAND = 'CUTIN'

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/** 보는 사람의 시간대를 알 수 없으므로 찍은 곳의 시간대로 고정한다. */
function formatDate(date: Date | null): string {
  if (date === null) return ''
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export function renderSharePage(data: SharePageData): string {
  const nickname = escapeHtml(data.nickname)
  const caption = data.caption === null ? '' : escapeHtml(data.caption)
  const composed = escapeHtml(data.composedUrl)
  const title = `${nickname}님의 네컷`
  const description = caption === '' ? `${BRAND}에서 찍은 네컷` : caption

  /* 영상이 이 페이지의 존재 이유다 — QR은 "찍는 동안 이런 일이 있었다"를 보여주려고 찍는다.
   * 합성본을 poster로 깔아 두면 영상이 뜨기 전에도 네컷이 먼저 보인다. */
  const video =
    data.motionUrl === null
      ? ''
      : `
      <video
        class="motion"
        src="${escapeHtml(data.motionUrl)}"
        poster="${composed}"
        controls
        playsinline
        loop
        preload="metadata"
      ></video>
      <p class="hint">촬영하는 동안 기록된 영상이에요</p>`

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · ${BRAND}</title>
<!-- 링크를 아는 사람만 보는 페이지다. 검색에 걸리면 "아는 사람만"이 깨진다. -->
<meta name="robots" content="noindex">
<meta property="og:type" content="website">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:image" content="${composed}">
<meta name="twitter:card" content="summary_large_image">
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 24px 16px 48px;
    background: #f6f4f1;
    color: #17161a;
    font-family: -apple-system, BlinkMacSystemFont, "Pretendard", "Apple SD Gothic Neo", sans-serif;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
  }
  .brand {
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.22em;
    color: #6b6870;
  }
  .card {
    width: 100%;
    max-width: 420px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  img, video { width: 100%; display: block; border-radius: 14px; background: #e6e3df; }
  .motion { aspect-ratio: 3 / 4; object-fit: cover; }
  .meta { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
  .who { font-size: 15px; font-weight: 600; }
  .when { font-size: 13px; color: #6b6870; font-variant-numeric: tabular-nums; }
  .caption { margin: 0; font-size: 15px; line-height: 1.55; white-space: pre-wrap; word-break: break-word; }
  .hint { margin: -4px 0 0; font-size: 13px; color: #6b6870; text-align: center; }
  .foot { font-size: 13px; color: #6b6870; text-align: center; line-height: 1.6; }
  @media (prefers-color-scheme: dark) {
    body { background: #121114; color: #f4f3f5; }
    .brand, .when, .hint, .foot { color: #9b98a1; }
    img, video { background: #232228; }
  }
</style>
</head>
<body>
  <div class="brand">${BRAND}</div>
  <div class="card">
    ${video}
    <img src="${composed}" alt="${title}">
    <div class="meta">
      <span class="who">${nickname}</span>
      <span class="when">${formatDate(data.publishedAt)}</span>
    </div>
    ${caption === '' ? '' : `<p class="caption">${caption}</p>`}
  </div>
  <p class="foot">네 컷을 찍어 친구와 나누는 앱, ${BRAND}</p>
</body>
</html>`
}

/** 없는 포스트·비공개 포스트가 같은 화면으로 떨어진다 — 존재 여부를 알려 주지 않는다. */
export function renderMissingPage(): string {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${BRAND}</title>
<meta name="robots" content="noindex">
<style>
  :root { color-scheme: light dark; }
  body {
    margin: 0; min-height: 100vh; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 10px;
    background: #f6f4f1; color: #17161a;
    font-family: -apple-system, BlinkMacSystemFont, "Pretendard", "Apple SD Gothic Neo", sans-serif;
  }
  .brand { font-size: 13px; font-weight: 600; letter-spacing: 0.22em; color: #6b6870; }
  p { margin: 0; font-size: 15px; }
  @media (prefers-color-scheme: dark) {
    body { background: #121114; color: #f4f3f5; }
    .brand { color: #9b98a1; }
  }
</style>
</head>
<body>
  <div class="brand">${BRAND}</div>
  <p>이 네컷은 볼 수 없어요</p>
</body>
</html>`
}
