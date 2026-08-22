import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { frameFooters, postStatuses, postVisibilities } from '../../db/schema/index.ts'
import { pageSchema } from '../../shared/pagination/paginationSchemas.ts'
import { uuidParamSchema } from '../../shared/validation/uuidParam.ts'
import { mediaSchema } from '../media/mediaSchemas.ts'
import { reactionSummarySchema } from '../reactions/reactionsSchemas.ts'

export const postIdSchema = uuidParamSchema

/** 실제 상한은 템플릿의 cutCount다. 여기 값은 비정상적으로 큰 요청을 막는 안전장치일 뿐이다. */
const maxCutsPerRequest = 20

export const templateSlotSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
})

/** 프레임 여백을 포함하지 않는다는 사실을 스펙에도 싣는다. 클라이언트가 캔버스를 유도한다. */
const GRID_SCOPE_NOTE =
  '컷 그리드 영역 기준이며 프레임 여백(padding·gutter)과 푸터를 포함하지 않는다.'

export const templateSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  cutCount: z.number().int().positive(),
  aspectRatio: z.string().describe(GRID_SCOPE_NOTE),
  slots: z.array(templateSlotSchema).describe(GRID_SCOPE_NOTE),
})

export const templatesResponseSchema = z.object({
  items: z.array(templateSchema),
})

/**
 * 기본 외형은 **서버가 풀지 않는다.** null은 "아직 고르지 않았다"는 상태 그대로 내려가고,
 * 무엇으로 그릴지는 클라이언트가 정한다. 서버가 대신 채우면 "미선택"과 "기본을 골랐다"가
 * 구분되지 않아 편집 화면이 둘을 표현할 수 없고, 기본값 결정이 렌더링하지 않는 쪽에 생긴다.
 */
const FRAME_UNSET_NOTE =
  '외형을 고르지 않았으면 null이다. 서버가 기본 외형으로 대신 채우지 않는다 — GET /frames의 첫 항목이 기본이다.'

/** 같은 규칙의 쓰기 쪽. null을 "기본으로 지정"으로 읽으면 미선택 상태를 만들 수 없다. */
const FRAME_CLEAR_NOTE = 'null은 선택 해제다. 기본 외형으로 치환되지 않고 미선택 상태가 된다.'

/**
 * 컷 그리드를 감싸는 외형. 길이 값은 전부 캔버스 폭 대비 비율이다.
 * `isActive`·`sortOrder`는 싣지 않는다 — 활성만 내려주고 배열이 이미 정렬돼 있다
 * (`templateSchema`와 같은 이유).
 */
export const frameSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  background: z.string(),
  foreground: z.string(),
  padding: z.number(),
  gutter: z.number(),
  cellRadius: z.number(),
  footer: z.enum(frameFooters).nullable(),
})

export const framesResponseSchema = z.object({
  items: z.array(frameSchema),
})

export const cutInputSchema = z.object({
  cutIndex: z.number().int().min(0),
  mediaId: z.uuid(),
})

export const createPostBodySchema = z.object({ templateId: z.uuid() })

export const updatePostBodySchema = z
  .object({
    templateId: z.uuid().optional(),
    caption: z.string().max(500).nullable().optional(),
    visibility: z
      .enum(postVisibilities)
      .optional()
      .describe('발행 뒤에도 바꿀 수 있다. 바꾸는 즉시 피드·상세·보관 목록의 노출이 따라온다.'),
    thumbnailCutIndex: z
      .number()
      .int()
      .min(0)
      .nullable()
      .optional()
      .describe('발행 뒤에도 바꿀 수 있다. 0 = 기본(첫 컷) = 고정 해제.'),
    /** 프로필 맨 앞 고정. 발행 뒤에도 바꿀 수 있다. */
    pinned: z.boolean().optional(),
    frameId: z.uuid().nullable().optional().describe(FRAME_CLEAR_NOTE),
    /** 부분 수정이 아니라 전체 교체다. */
    cuts: z.array(cutInputSchema).max(maxCutsPerRequest).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, '변경할 항목이 없습니다')

export const publishPostBodySchema = z.object({
  composedMediaId: z.uuid(),
  caption: z.string().max(500).nullable().optional(),
  visibility: z.enum(postVisibilities).optional(),
  thumbnailCutIndex: z.number().int().min(0).optional(),
  /** 발행과 함께 고정. 없으면 false. */
  pinned: z.boolean().optional(),
})

export const postAuthorSchema = z.object({
  id: z.uuid(),
  nickname: z.string().nullable(),
  avatarUrl: z.string().nullable(),
})

export const postCutSchema = z.object({
  cutIndex: z.number().int().min(0),
  media: mediaSchema,
})

export const postSchema = z.object({
  id: z.uuid(),
  author: postAuthorSchema,
  template: templateSchema,
  frame: frameSchema.nullable().describe(FRAME_UNSET_NOTE),
  status: z.enum(postStatuses),
  visibility: z.enum(postVisibilities),
  caption: z.string().nullable(),
  thumbnailCutIndex: z.number().int().nullable(),
  /** 프로필 그리드 맨 앞 고정(§6.3). 대표 컷과 별개다. */
  pinned: z.boolean(),
  cuts: z.array(postCutSchema),
  /** iOS가 만든 합성본. draft에는 없다. */
  composed: mediaSchema.nullable(),
  publishedAt: z.string().nullable(),
  createdAt: z.string(),
  commentCount: z.number().int().min(0),
  reactions: reactionSummarySchema,
  /** 요청자가 보관했는지 */
  bookmarked: z.boolean(),
})

export const postPageSchema = pageSchema(postSchema)

export const shareLinkSchema = z.object({
  url: z.string(),
})

export class TemplatesResponseDto extends createZodDto(templatesResponseSchema) {}
export class FramesResponseDto extends createZodDto(framesResponseSchema) {}
export class CreatePostBodyDto extends createZodDto(createPostBodySchema) {}
export class UpdatePostBodyDto extends createZodDto(updatePostBodySchema) {}
export class PublishPostBodyDto extends createZodDto(publishPostBodySchema) {}
export class PostDto extends createZodDto(postSchema) {}
export class PostPageDto extends createZodDto(postPageSchema) {}
export class ShareLinkDto extends createZodDto(shareLinkSchema) {}
