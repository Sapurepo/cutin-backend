import { z } from 'zod'

/**
 * 경로 파라미터로 들어오는 uuid.
 *
 * Swift의 `UUID`는 대문자로 직렬화되는데 DB는 소문자를 돌려준다. Postgres는 uuid로 캐스팅해
 * 비교하므로 쿼리는 그대로 통과하지만, **애플리케이션의 문자열 비교는 조용히 빗나간다** —
 * 관계 판정(`follows.followerId === targetId`), 친구 쌍 정렬, 조회 결과를 id로 되찾는 자리가
 * 전부 여기에 걸린다. 값을 받는 경계에서 한 번 소문자로 맞춰 이 부류를 없앤다.
 */
export const uuidParamSchema = z.uuid().toLowerCase()
