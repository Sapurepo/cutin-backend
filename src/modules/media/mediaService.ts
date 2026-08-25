import { randomUUID } from 'node:crypto'
import { Inject, Injectable } from '@nestjs/common'
import type { Media, MediaKind } from '../../db/schema/index.ts'
import { AppError } from '../../shared/errors/appError.ts'
import { STORAGE } from '../../shared/storage/storageModule.ts'
import type { StorageService } from '../../shared/storage/storageService.ts'
import { MediaRepository } from './mediaRepository.ts'

const extensions: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'video/mp4': 'mp4',
}

/**
 * 종류와 형식은 짝이 맞아야 한다. 둘을 따로 검증하면 클라이언트 결함 하나로 컷 자리에 영상이
 * 들어가고, 그 포스트는 피드에서 영영 그려지지 않는다.
 */
function mimeMatchesKind(kind: MediaKind, mime: string): boolean {
  const wantsVideo = kind === 'motion'
  return wantsVideo === mime.startsWith('video/')
}

export interface MediaView {
  id: string
  kind: MediaKind
  url: string
  width: number | null
  height: number | null
}

@Injectable()
export class MediaService {
  constructor(
    private readonly repository: MediaRepository,
    @Inject(STORAGE) private readonly storage: StorageService,
  ) {}

  toView(row: Media): MediaView {
    return {
      id: row.id,
      kind: row.kind,
      url: this.storage.url(row.storageKey),
      width: row.width,
      height: row.height,
    }
  }

  async createUpload(ownerId: string, input: { kind: MediaKind; mime: string }) {
    if (!mimeMatchesKind(input.kind, input.mime)) {
      throw AppError.badRequest('MIME_KIND_MISMATCH', '종류에 맞지 않는 형식입니다.')
    }
    const storageKey = this.buildStorageKey(ownerId, input.kind, input.mime)
    const row = await this.repository.create({ ownerId, storageKey, ...input })
    const target = await this.storage.createUploadTarget(storageKey, input.mime)
    return { mediaId: row.id, ...target }
  }

  /** 로컬 디스크 구현이 바이트를 받는 경로. 서명 URL 방식으로 바뀌면 쓰이지 않는다. */
  async putContent(storageKey: string, ownerId: string, body: Buffer): Promise<void> {
    const row = await this.repository.findByStorageKey(storageKey)
    if (row === undefined || row.ownerId !== ownerId) {
      throw AppError.notFound('MEDIA_NOT_FOUND', '미디어를 찾을 수 없습니다.')
    }
    await this.storage.put(storageKey, body)
  }

  async readContent(storageKey: string): Promise<{ body: Buffer; mime: string }> {
    const row = await this.repository.findByStorageKey(storageKey)
    const body = row === undefined ? undefined : await this.storage.read(storageKey)
    if (row === undefined || body === undefined) {
      throw AppError.notFound('MEDIA_NOT_FOUND', '미디어를 찾을 수 없습니다.')
    }
    return { body, mime: row.mime }
  }

  /** 업로드가 실제로 도착했는지 스토리지에 확인하고 나서야 ready로 올린다. */
  async complete(
    mediaId: string,
    ownerId: string,
    size: { width: number; height: number },
  ): Promise<MediaView> {
    const row = await this.requireOwnedMedia(mediaId, ownerId)
    const stored = await this.storage.stat(row.storageKey)
    if (stored === undefined) {
      throw AppError.badRequest('UPLOAD_NOT_FOUND', '업로드된 파일을 찾을 수 없습니다.')
    }
    const updated = await this.repository.markReady(mediaId, { bytes: stored.bytes, ...size })
    if (updated === undefined) {
      throw AppError.notFound('MEDIA_NOT_FOUND', '미디어를 찾을 수 없습니다.')
    }
    return this.toView(updated)
  }

  /** 키에 소유자와 미디어 id가 들어가므로 추측으로 남의 파일에 닿을 수 없다. */
  private buildStorageKey(ownerId: string, kind: MediaKind, mime: string): string {
    const extension = extensions[mime]
    if (extension === undefined) {
      throw AppError.badRequest('UNSUPPORTED_MIME', '지원하지 않는 형식입니다.')
    }
    return `${kind}/${ownerId}/${randomUUID()}.${extension}`
  }

  private async requireOwnedMedia(mediaId: string, ownerId: string): Promise<Media> {
    const row = await this.repository.findById(mediaId)
    if (row === undefined || row.ownerId !== ownerId) {
      throw AppError.notFound('MEDIA_NOT_FOUND', '미디어를 찾을 수 없습니다.')
    }
    return row
  }
}
