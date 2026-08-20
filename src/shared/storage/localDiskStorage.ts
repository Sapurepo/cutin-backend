import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import type { StorageService, UploadTarget } from './storageService.ts'

/** 키는 서버가 만든 `{kind}/{ownerId}/{mediaId}.{ext}` 형태만 허용한다. */
const keyPattern = /^[a-z]+\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.[a-z0-9]+$/

export interface LocalDiskStorageOptions {
  directory: string
  /** 클라이언트가 바이트를 PUT할 곳. 서명 URL로 가면 벤더 도메인이 된다 */
  uploadBaseUrl: string
  /** 클라이언트가 이미지를 GET할 곳. CDN이 붙으면 여기만 갈라진다 */
  mediaBaseUrl: string
}

export function createLocalDiskStorage({
  directory,
  uploadBaseUrl,
  mediaBaseUrl,
}: LocalDiskStorageOptions): StorageService {
  const root = resolve(directory)

  function pathFor(key: string): string {
    const target = resolve(root, key)
    if (!keyPattern.test(key) || !target.startsWith(`${root}${sep}`)) {
      throw new Error(`저장 키가 올바르지 않습니다: ${key}`)
    }
    return target
  }

  return {
    async createUploadTarget(key: string, mime: string): Promise<UploadTarget> {
      return {
        url: `${uploadBaseUrl}/media/content/${key}`,
        method: 'PUT',
        headers: { 'content-type': mime },
      }
    },

    async put(key: string, body: Buffer): Promise<void> {
      const target = pathFor(key)
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, body)
    },

    async stat(key: string): Promise<{ bytes: number } | undefined> {
      try {
        const info = await stat(pathFor(key))
        return { bytes: info.size }
      } catch {
        return undefined
      }
    },

    async read(key: string): Promise<Buffer | undefined> {
      try {
        return await readFile(pathFor(key))
      } catch {
        return undefined
      }
    },

    url(key: string): string {
      return `${mediaBaseUrl}/media/content/${key}`
    },

    async remove(key: string): Promise<void> {
      await rm(pathFor(key), { force: true })
    },
  }
}
