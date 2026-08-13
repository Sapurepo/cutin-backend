/**
 * 바이트 저장소. 인프라가 확정되면 이 인터페이스의 구현체만 갈아끼운다.
 *
 * MVP는 서버가 업로드를 중계한다(`PUT /media/{id}/content`). S3·R2가 정해지면
 * `createUploadTarget`이 서명 URL을 돌려주도록 바뀌고, 클라이언트 플로우
 * (목적지 발급 → 업로드 → complete)는 그대로 유지된다.
 */
export interface StorageService {
  /** 클라이언트가 바이트를 보낼 곳 */
  createUploadTarget(key: string, mime: string): UploadTarget
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
