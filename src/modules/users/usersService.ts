import { Inject, Injectable } from '@nestjs/common'
import type { NotificationSlot } from '../../db/schema/index.ts'
import { AppError } from '../../shared/errors/appError.ts'
import { STORAGE } from '../../shared/storage/storageModule.ts'
import type { StorageService } from '../../shared/storage/storageService.ts'
import { MediaRepository } from '../media/mediaRepository.ts'
import { containsForbiddenWord } from './nicknamePolicy.ts'
import type { UpdatableUserFields, UserWithAvatar } from './usersRepository.ts'
import { UsersRepository } from './usersRepository.ts'
import { nicknameSchema } from './usersSchemas.ts'

/** 슬롯을 미선택한 사용자에게 적용하는 기본값 (명세 §3.3) */
const defaultSlots: NotificationSlot[] = ['morning']

export interface UserProfile {
  id: string
  nickname: string | null
  avatarUrl: string | null
  timezone: string
  onboardingCompleted: boolean
}

@Injectable()
export class UsersService {
  constructor(
    private readonly repository: UsersRepository,
    private readonly mediaRepository: MediaRepository,
    @Inject(STORAGE) private readonly storage: StorageService,
  ) {}

  async checkNicknameAvailability(nickname: string) {
    if (!nicknameSchema.safeParse(nickname).success) {
      return { available: false, reason: 'invalidFormat' as const }
    }
    if (containsForbiddenWord(nickname)) {
      return { available: false, reason: 'forbiddenWord' as const }
    }
    if (await this.repository.isNicknameTaken(nickname)) {
      return { available: false, reason: 'taken' as const }
    }
    return { available: true, reason: null }
  }

  async updateMe(userId: string, values: UpdatableUserFields): Promise<UserProfile> {
    if (values.nickname !== undefined) {
      if (containsForbiddenWord(values.nickname)) {
        throw AppError.badRequest('NICKNAME_FORBIDDEN', '사용할 수 없는 닉네임입니다.')
      }
      if (await this.repository.isNicknameTaken(values.nickname)) {
        throw AppError.conflict('NICKNAME_TAKEN', '이미 사용 중인 닉네임입니다.')
      }
    }
    // 아바타는 내 것이면서 업로드가 끝난 avatar 미디어만 붙일 수 있다.
    if (values.avatarMediaId != null) {
      const [avatar] = await this.mediaRepository.findReadyByIds([values.avatarMediaId], userId)
      if (avatar === undefined || avatar.kind !== 'avatar') {
        throw AppError.badRequest('MEDIA_NOT_READY', '프로필 사진 업로드가 끝나지 않았습니다.')
      }
    }

    if (!(await this.repository.update(userId, values))) {
      throw AppError.notFound('USER_NOT_FOUND', '사용자를 찾을 수 없습니다.')
    }
    return this.toProfile(await this.requireUser(userId))
  }

  async getMe(userId: string): Promise<UserProfile> {
    return this.toProfile(await this.requireUser(userId))
  }

  async getPreferences(userId: string) {
    const preference = await this.repository.findPreferences(userId)
    return preference === undefined
      ? { slots: defaultSlots, pushEnabled: true }
      : { slots: preference.slots, pushEnabled: preference.pushEnabled }
  }

  async updatePreferences(
    userId: string,
    values: { slots: NotificationSlot[]; pushEnabled: boolean },
  ) {
    const slots = [...new Set(values.slots)]
    const saved = await this.repository.upsertPreferences(userId, { ...values, slots })
    return { slots: saved.slots, pushEnabled: saved.pushEnabled }
  }

  /** 닉네임이 온보딩의 필수 단계다. 알림 슬롯은 미선택 시 기본값으로 채운다. */
  async completeOnboarding(userId: string): Promise<UserProfile> {
    const user = await this.requireUser(userId)
    if (user.nickname === null) {
      throw AppError.badRequest('NICKNAME_REQUIRED', '닉네임을 먼저 설정해야 합니다.')
    }
    if ((await this.repository.findPreferences(userId)) === undefined) {
      await this.repository.upsertPreferences(userId, { slots: defaultSlots, pushEnabled: true })
    }
    if (!(await this.repository.completeOnboarding(userId))) {
      throw AppError.notFound('USER_NOT_FOUND', '사용자를 찾을 수 없습니다.')
    }
    return this.toProfile(await this.requireUser(userId))
  }

  private toProfile(user: UserWithAvatar): UserProfile {
    return {
      id: user.id,
      nickname: user.nickname,
      avatarUrl: user.avatar === null ? null : this.storage.url(user.avatar.storageKey),
      timezone: user.timezone,
      onboardingCompleted: user.onboardingCompletedAt !== null,
    }
  }

  private async requireUser(userId: string): Promise<UserWithAvatar> {
    const user = await this.repository.findById(userId)
    if (user === undefined) throw AppError.notFound('USER_NOT_FOUND', '사용자를 찾을 수 없습니다.')
    return user
  }
}
