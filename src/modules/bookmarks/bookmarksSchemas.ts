import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export const bookmarkResultSchema = z.object({
  bookmarked: z.boolean(),
})

export class BookmarkResultDto extends createZodDto(bookmarkResultSchema) {}
