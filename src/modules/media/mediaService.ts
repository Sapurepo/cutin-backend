import { randomUUID } from 'node:crypto'
import type { Media, MediaKind } from '../../db/schema/index.ts'
import { AppError } from '../../shared/errors/appError.ts'
import type { StorageService } from '../../shared/storage/storageService.ts'
import type { MediaRepository } from './mediaRepository.ts'

const extensions: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
}

export interface MediaView {
  id: string
  kind: MediaKind
  url: string
  width: number | null
  height: number | null
}

export function createMediaService(repository: MediaRepository, storage: StorageService) {
  function toView(row: Media): MediaView {
    return {
      id: row.id,
      kind: row.kind,
      url: storage.url(row.storageKey),
      width: row.width,
      height: row.height,
    }
  }

  /** 키에 소유자와 미디어 id가 들어가므로 추측으로 남의 파일에 닿을 수 없다. */
  function buildStorageKey(ownerId: string, kind: MediaKind, mime: string): string {
    const extension = extensions[mime]
    if (extension === undefined) {
      throw AppError.badRequest('UNSUPPORTED_MIME', '지원하지 않는 이미지 형식입니다.')
    }
    return `${kind}/${ownerId}/${randomUUID()}.${extension}`
  }

  async function requireOwnedMedia(mediaId: string, ownerId: string): Promise<Media> {
    const row = await repository.findById(mediaId)
    if (row === undefined || row.ownerId !== ownerId) {
      throw AppError.notFound('MEDIA_NOT_FOUND', '미디어를 찾을 수 없습니다.')
    }
    return row
  }

  return {
    toView,

    async createUpload(ownerId: string, input: { kind: MediaKind; mime: string }) {
      const storageKey = buildStorageKey(ownerId, input.kind, input.mime)
      const row = await repository.create({ ownerId, storageKey, ...input })
      const target = storage.createUploadTarget(storageKey, input.mime)
      return { mediaId: row.id, ...target }
    },

    /** 로컬 디스크 구현이 바이트를 받는 경로. 서명 URL 방식으로 바뀌면 쓰이지 않는다. */
    async putContent(storageKey: string, ownerId: string, body: Buffer): Promise<void> {
      const row = await repository.findByStorageKey(storageKey)
      if (row === undefined || row.ownerId !== ownerId) {
        throw AppError.notFound('MEDIA_NOT_FOUND', '미디어를 찾을 수 없습니다.')
      }
      await storage.put(storageKey, body)
    },

    async readContent(storageKey: string): Promise<{ body: Buffer; mime: string }> {
      const row = await repository.findByStorageKey(storageKey)
      const body = row === undefined ? undefined : await storage.read(storageKey)
      if (row === undefined || body === undefined) {
        throw AppError.notFound('MEDIA_NOT_FOUND', '미디어를 찾을 수 없습니다.')
      }
      return { body, mime: row.mime }
    },

    /** 업로드가 실제로 도착했는지 스토리지에 확인하고 나서야 ready로 올린다. */
    async complete(
      mediaId: string,
      ownerId: string,
      size: { width: number; height: number },
    ): Promise<MediaView> {
      const row = await requireOwnedMedia(mediaId, ownerId)
      const stored = await storage.stat(row.storageKey)
      if (stored === undefined) {
        throw AppError.badRequest('UPLOAD_NOT_FOUND', '업로드된 파일을 찾을 수 없습니다.')
      }
      const updated = await repository.markReady(mediaId, { bytes: stored.bytes, ...size })
      if (updated === undefined) {
        throw AppError.notFound('MEDIA_NOT_FOUND', '미디어를 찾을 수 없습니다.')
      }
      return toView(updated)
    },
  }
}

export type MediaService = ReturnType<typeof createMediaService>
