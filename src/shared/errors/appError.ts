/**
 * 클라이언트에 그대로 전달되는 도메인 오류.
 * `code`는 iOS·어드민이 분기에 쓰는 안정적인 식별자이므로 변경 시 클라이언트와 함께 맞춘다.
 */
export class AppError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly details?: unknown

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'AppError'
    this.statusCode = statusCode
    this.code = code
    this.details = details
  }

  static badRequest(code: string, message: string, details?: unknown): AppError {
    return new AppError(400, code, message, details)
  }

  static unauthorized(code: string, message: string): AppError {
    return new AppError(401, code, message)
  }

  static forbidden(code: string, message: string): AppError {
    return new AppError(403, code, message)
  }

  static notFound(code: string, message: string): AppError {
    return new AppError(404, code, message)
  }

  static conflict(code: string, message: string, details?: unknown): AppError {
    return new AppError(409, code, message, details)
  }
}
