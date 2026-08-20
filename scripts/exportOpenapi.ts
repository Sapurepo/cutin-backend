import 'reflect-metadata'
import { writeFile } from 'node:fs/promises'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { AppModule } from '../src/appModule.ts'
import { buildOpenapiDocument } from '../src/openapi.ts'

// postgres.js는 지연 연결이므로 스펙 산출만으로는 DB에 접속하지 않는다.
const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
  logger: false,
})
await app.init()

await writeFile('openapi.json', `${JSON.stringify(buildOpenapiDocument(app), null, 2)}\n`)

await app.close()

console.log('openapi.json 생성 완료')
