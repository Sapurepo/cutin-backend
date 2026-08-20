/**
 * 바이트 저장소. 인프라가 확정되면 이 인터페이스의 구현체만 갈아끼운다.
 *
 * MVP는 서버가 업로드를 중계한다(`PUT /media/{id}/content`). S3·R2가 정해지면
 * `createUploadTarget`이 서명 URL을 돌려주도록 바뀌고, 클라이언트 플로우
 * (목적지 발급 → 업로드 → complete)는 그대로 유지된다.
 *
 * 그래서 `createUploadTarget`은 async다 — 서명 URL 발급은 어느 벤더 SDK에서도 비동기다.
 * 반면 `url()`은 **퍼블릭 CDN 읽기를 전제로 동기를 유지한다.** 서명 GET URL로 가면
 * 매핑 함수가 전부 async가 되어 `toPage`를 타고 모든 목록 엔드포인트로 번지고,
 * 요청마다 URL이 달라져 CDN·클라이언트 캐시가 무효화된다. 근거는 `docs/infraVendors.md`.
 */
export interface StorageService {
  /** 클라이언트가 바이트를 보낼 곳 */
  createUploadTarget(key: string, mime: string): Promise<UploadTarget>
  put(key: string, body: Buffer): Promise<void>
  /** 업로드가 실제로 끝났는지 확인한다. 없으면 undefined */
  stat(key: string): Promise<{ bytes: number } | undefined>
  read(key: string): Promise<Buffer | undefined>
  /** 클라이언트가 이미지를 내려받는 URL */
  url(key: string): string
  remove(key: string): Promise<void>
}

export interface UploadTarget {
  url: string
  method: 'PUT'
  headers: Record<string, string>
}
