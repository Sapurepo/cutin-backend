import { Inject, Injectable } from '@nestjs/common'
import { and, count, desc, eq, isNotNull, isNull, ne, or, type SQL, sql } from 'drizzle-orm'
import type { Database } from '../../db/client.ts'
import { DATABASE } from '../../db/databaseModule.ts'
import {
  blocks,
  follows,
  friendships,
  type Media,
  media,
  type User,
  users,
} from '../../db/schema/index.ts'
import { decodeCursor, encodeCursor, type Page, toPage } from '../../shared/pagination/cursor.ts'

export type UserWithAvatar = User & { avatar: Media | null }

/** 리포지토리는 저장 키까지만 안다. URL로 바꾸는 것은 서비스의 몫이다. */
export interface PublicUserRow {
  id: string
  nickname: string | null
  avatarKey: string | null
}

export interface RecommendedUserRow extends PublicUserRow {
  mutualFriendCount: number
}

export interface PageQuery {
  cursor?: string
  limit: number
}

/**
 * 한 쌍이 `friendships`에 한 행만 갖도록 uuid를 사전순으로 정렬한다.
 * 문자열 비교라 **두 값이 같은 표기(소문자)여야** Postgres의 uuid 순서와 일치한다 —
 * 경로 파라미터는 `uuidParamSchema`가, 토큰의 sub는 DB가 이미 소문자로 맞춰 준다.
 */
function normalizePair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a]
}

function toPublicUserRow(row: PublicUserRow): PublicUserRow {
  return { id: row.id, nickname: row.nickname, avatarKey: row.avatarKey }
}

@Injectable()
export class SocialRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** 어느 방향으로든 차단이 걸린 사용자를 목록에서 제외한다. */
  private notBlockedWith(viewerId: string): SQL {
    return sql`not exists (
      select 1 from ${blocks}
      where (${blocks.blockerId} = ${viewerId}::uuid and ${blocks.blockedId} = ${users.id})
         or (${blocks.blockerId} = ${users.id} and ${blocks.blockedId} = ${viewerId}::uuid)
    )`
  }

  /** 검색·추천에 노출할 수 있는 사용자인지 (탈퇴·정지·온보딩 미완료 제외) */
  private isDiscoverable(): SQL[] {
    return [isNull(users.deletedAt), eq(users.status, 'active'), isNotNull(users.nickname)]
  }

  private async listFollows(
    userId: string,
    direction: 'followers' | 'followees',
    { cursor, limit }: PageQuery,
  ): Promise<Page<PublicUserRow>> {
    const [ownColumn, otherColumn] =
      direction === 'followers'
        ? [follows.followeeId, follows.followerId]
        : [follows.followerId, follows.followeeId]

    const conditions = [eq(ownColumn, userId), isNull(users.deletedAt)]
    if (cursor !== undefined) {
      const [createdAt, id] = decodeCursor(cursor)
      conditions.push(
        sql`(${follows.createdAt}, ${follows.id}) < (${createdAt}::timestamptz, ${id}::uuid)`,
      )
    }

    const rows = await this.db
      .select({
        id: users.id,
        nickname: users.nickname,
        avatarKey: media.storageKey,
        followId: follows.id,
        createdAt: follows.createdAt,
      })
      .from(follows)
      .innerJoin(users, eq(users.id, otherColumn))
      .leftJoin(media, eq(media.id, users.avatarMediaId))
      .where(and(...conditions))
      .orderBy(desc(follows.createdAt), desc(follows.id))
      .limit(limit + 1)

    return toPage(rows, limit, toPublicUserRow, (row) =>
      encodeCursor(row.createdAt.toISOString(), row.followId),
    )
  }

  /** 검색·추천 대상이 되는 활성 사용자. 정지·탈퇴 계정은 없는 것으로 취급한다. */
  findActiveUser(userId: string): Promise<UserWithAvatar | undefined> {
    return this.db.query.users.findFirst({
      where: and(eq(users.id, userId), eq(users.status, 'active'), isNull(users.deletedAt)),
      with: { avatar: true },
    })
  }

  async blockState(
    viewerId: string,
    targetId: string,
  ): Promise<{ blocking: boolean; blockedBy: boolean }> {
    const rows = await this.db
      .select({ blockerId: blocks.blockerId })
      .from(blocks)
      .where(
        or(
          and(eq(blocks.blockerId, viewerId), eq(blocks.blockedId, targetId)),
          and(eq(blocks.blockerId, targetId), eq(blocks.blockedId, viewerId)),
        ),
      )
    return {
      blocking: rows.some((row) => row.blockerId === viewerId),
      blockedBy: rows.some((row) => row.blockerId === targetId),
    }
  }

  async relation(
    viewerId: string,
    targetId: string,
  ): Promise<{ following: boolean; followedBy: boolean; friend: boolean }> {
    const [low, high] = normalizePair(viewerId, targetId)
    const [followRows, friendRows] = await Promise.all([
      this.db
        .select({ followerId: follows.followerId })
        .from(follows)
        .where(
          or(
            and(eq(follows.followerId, viewerId), eq(follows.followeeId, targetId)),
            and(eq(follows.followerId, targetId), eq(follows.followeeId, viewerId)),
          ),
        ),
      this.db
        .select({ userIdLow: friendships.userIdLow })
        .from(friendships)
        .where(and(eq(friendships.userIdLow, low), eq(friendships.userIdHigh, high))),
    ])
    return {
      following: followRows.some((row) => row.followerId === viewerId),
      followedBy: followRows.some((row) => row.followerId === targetId),
      friend: friendRows.length > 0,
    }
  }

  async friendCount(userId: string): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(friendships)
      .where(or(eq(friendships.userIdLow, userId), eq(friendships.userIdHigh, userId)))
    return row?.value ?? 0
  }

  /** 팔로우 생성과 파생 테이블 동기화를 한 트랜잭션에서 처리한다. */
  follow(followerId: string, followeeId: string): Promise<{ friend: boolean }> {
    return this.db.transaction(async (tx) => {
      const [userIdLow, userIdHigh] = normalizePair(followerId, followeeId)
      /* 두 사람이 거의 동시에 서로를 팔로우하면 READ COMMITTED에서 상대의 아직 커밋되지 않은
       * 팔로우 행이 보이지 않아 **양쪽 모두 맞팔을 놓치고 친구 행이 영영 생기지 않는다.**
       * 쌍 단위 자문 잠금으로 같은 쌍의 팔로우를 직렬화해 뒤에 온 쪽이 반드시 상대를 보게 한다. */
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${userIdLow}), hashtext(${userIdHigh}))`,
      )
      await tx.insert(follows).values({ followerId, followeeId }).onConflictDoNothing()

      const [reverse] = await tx
        .select({ id: follows.id })
        .from(follows)
        .where(and(eq(follows.followerId, followeeId), eq(follows.followeeId, followerId)))
        .limit(1)
      if (reverse === undefined) return { friend: false }

      await tx.insert(friendships).values({ userIdLow, userIdHigh }).onConflictDoNothing()
      return { friend: true }
    })
  }

  async unfollow(followerId: string, followeeId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(follows)
        .where(and(eq(follows.followerId, followerId), eq(follows.followeeId, followeeId)))
      const [userIdLow, userIdHigh] = normalizePair(followerId, followeeId)
      await tx
        .delete(friendships)
        .where(and(eq(friendships.userIdLow, userIdLow), eq(friendships.userIdHigh, userIdHigh)))
    })
  }

  /** 차단하면 양방향 팔로우와 친구 관계가 즉시 끊긴다. */
  async block(blockerId: string, blockedId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.insert(blocks).values({ blockerId, blockedId }).onConflictDoNothing()
      await tx
        .delete(follows)
        .where(
          or(
            and(eq(follows.followerId, blockerId), eq(follows.followeeId, blockedId)),
            and(eq(follows.followerId, blockedId), eq(follows.followeeId, blockerId)),
          ),
        )
      const [userIdLow, userIdHigh] = normalizePair(blockerId, blockedId)
      await tx
        .delete(friendships)
        .where(and(eq(friendships.userIdLow, userIdLow), eq(friendships.userIdHigh, userIdHigh)))
    })
  }

  /** 차단을 풀어도 끊긴 팔로우는 되살리지 않는다. */
  async unblock(blockerId: string, blockedId: string): Promise<void> {
    await this.db
      .delete(blocks)
      .where(and(eq(blocks.blockerId, blockerId), eq(blocks.blockedId, blockedId)))
  }

  listFollowers(userId: string, page: PageQuery): Promise<Page<PublicUserRow>> {
    return this.listFollows(userId, 'followers', page)
  }

  listFollowees(userId: string, page: PageQuery): Promise<Page<PublicUserRow>> {
    return this.listFollows(userId, 'followees', page)
  }

  async listFriends(userId: string, { cursor, limit }: PageQuery): Promise<Page<PublicUserRow>> {
    const friendId = sql`case when ${friendships.userIdLow} = ${userId}::uuid
      then ${friendships.userIdHigh} else ${friendships.userIdLow} end`

    const conditions = [
      or(eq(friendships.userIdLow, userId), eq(friendships.userIdHigh, userId)),
      isNull(users.deletedAt),
    ]
    if (cursor !== undefined) {
      const [createdAt, id] = decodeCursor(cursor)
      conditions.push(
        sql`(${friendships.createdAt}, ${users.id}) < (${createdAt}::timestamptz, ${id}::uuid)`,
      )
    }

    const rows = await this.db
      .select({
        id: users.id,
        nickname: users.nickname,
        avatarKey: media.storageKey,
        createdAt: friendships.createdAt,
      })
      .from(friendships)
      .innerJoin(users, sql`${users.id} = ${friendId}`)
      .leftJoin(media, eq(media.id, users.avatarMediaId))
      .where(and(...conditions))
      .orderBy(desc(friendships.createdAt), desc(users.id))
      .limit(limit + 1)

    return toPage(rows, limit, toPublicUserRow, (row) =>
      encodeCursor(row.createdAt.toISOString(), row.id),
    )
  }

  /** 닉네임 부분 일치 검색. 정렬 키가 닉네임이므로 커서도 닉네임 기준이다. */
  async search(
    viewerId: string,
    keyword: string,
    { cursor, limit }: PageQuery,
  ): Promise<Page<PublicUserRow>> {
    const conditions = [
      ...this.isDiscoverable(),
      ne(users.id, viewerId),
      sql`lower(${users.nickname}) like '%' || lower(${keyword}) || '%'`,
      this.notBlockedWith(viewerId),
    ]
    if (cursor !== undefined) {
      const [nickname, id] = decodeCursor(cursor)
      conditions.push(sql`(lower(${users.nickname}), ${users.id}) > (${nickname}, ${id}::uuid)`)
    }

    const rows = await this.db
      .select({ id: users.id, nickname: users.nickname, avatarKey: media.storageKey })
      .from(users)
      .leftJoin(media, eq(media.id, users.avatarMediaId))
      .where(and(...conditions))
      .orderBy(sql`lower(${users.nickname}) asc`, users.id)
      .limit(limit + 1)

    return toPage(rows, limit, toPublicUserRow, (row) =>
      encodeCursor((row.nickname ?? '').toLowerCase(), row.id),
    )
  }

  /**
   * 공통 친구가 많은 순 → 최근 가입 순. 정렬 키 하나로 "친구의 친구 → 신규 가입자"가 나온다.
   * 이미 친구이거나 팔로우했거나 차단이 걸린 사용자는 후보에서 뺀다.
   */
  async recommend(viewerId: string, limit: number): Promise<RecommendedUserRow[]> {
    const rows = await this.db.execute<{
      id: string
      nickname: string | null
      avatar_key: string | null
      mutual: number
    }>(sql`
      with my_friends as (
        select case when user_id_low = ${viewerId}::uuid then user_id_high else user_id_low end as id
        from friendships
        where user_id_low = ${viewerId}::uuid or user_id_high = ${viewerId}::uuid
      ),
      mutual_counts as (
        select case when f.user_id_low = mf.id then f.user_id_high else f.user_id_low end as id,
               count(*)::int as mutual
        from friendships f
        join my_friends mf on mf.id in (f.user_id_low, f.user_id_high)
        group by 1
      )
      select u.id, u.nickname, am.storage_key as avatar_key, coalesce(m.mutual, 0) as mutual
      from users u
      left join mutual_counts m on m.id = u.id
      left join media am on am.id = u.avatar_media_id
      where u.deleted_at is null and u.status = 'active' and u.nickname is not null
        and u.id <> ${viewerId}::uuid
        and u.id not in (select id from my_friends)
        and not exists (
          select 1 from follows
          where follower_id = ${viewerId}::uuid and followee_id = u.id
        )
        and not exists (
          select 1 from blocks
          where (blocker_id = ${viewerId}::uuid and blocked_id = u.id)
             or (blocker_id = u.id and blocked_id = ${viewerId}::uuid)
        )
      order by coalesce(m.mutual, 0) desc, u.created_at desc, u.id
      limit ${limit}
    `)

    return [...rows].map((row) => ({
      id: row.id,
      nickname: row.nickname,
      avatarKey: row.avatar_key,
      mutualFriendCount: row.mutual,
    }))
  }
}
