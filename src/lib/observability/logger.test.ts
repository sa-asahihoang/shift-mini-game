// src/lib/observability/logger.test.ts
import { Writable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import pino from 'pino'
import { REDACT_PATHS } from './logger'
import { currentRequestId, getContext, runWithContext, setContext } from './request-context'

function captureLines(): { lines: string[]; stream: Writable } {
  const lines: string[] = []
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(String(chunk))
      callback()
    },
  })
  return { lines, stream }
}

describe('redaction', () => {
  it('không để serverSeed lọt ra log dù log nguyên object lượt chơi', () => {
    const { lines, stream } = captureLines()
    const log = pino({ redact: { paths: REDACT_PATHS, censor: '[REDACTED]' } }, stream)

    log.info({ run: { id: 'r1', serverSeed: 'DEADBEEF'.repeat(8), commitment: 'ab' } }, 'bắt đầu lượt')

    const output = lines.join('')
    expect(output).not.toContain('DEADBEEF')
    expect(output).toContain('[REDACTED]')
    expect(output).toContain('"commitment":"ab"')
  })

  it('che serverSeed ở cả cấp cao nhất lẫn trong mảng rounds', () => {
    const { lines, stream } = captureLines()
    const log = pino({ redact: { paths: REDACT_PATHS, censor: '[REDACTED]' } }, stream)

    log.info({ serverSeed: 'AAAA1111', result: { serverSeed: 'BBBB2222' } }, 'kết quả')

    const output = lines.join('')
    expect(output).not.toContain('AAAA1111')
    expect(output).not.toContain('BBBB2222')
  })

  it('che cả những hình dạng lồng sâu và mảng mà các test trên không chạm tới', () => {
    const { lines, stream } = captureLines()
    const log = pino({ redact: { paths: REDACT_PATHS, censor: '[REDACTED]' } }, stream)

    log.info(
      {
        a: { b: { serverSeed: 'HAI-CAP' } },
        c: { d: { e: { serverSeed: 'BA-CAP' } } },
        rounds: [{ nonce: 0, serverSeed: 'TRONG-MANG' }],
      },
      'các hình dạng lồng',
    )

    const output = lines.join('')
    expect(output).not.toContain('HAI-CAP')
    expect(output).not.toContain('BA-CAP')
    expect(output).not.toContain('TRONG-MANG')
  })

  it('redaction sống sót qua logger con — đây mới là lối gọi thật', () => {
    const { lines, stream } = captureLines()
    const log = pino({ redact: { paths: REDACT_PATHS, censor: '[REDACTED]' } }, stream)

    // getLogger() gắn context bằng logger.child(), nên phải chứng minh việc che
    // vẫn còn tác dụng sau khi tạo con, không chỉ trên logger gốc.
    log.child({ requestId: 'req-1' }).info({ run: { serverSeed: 'QUA-CON' } }, 'qua con')

    expect(lines.join('')).not.toContain('QUA-CON')
  })
})

describe('request context', () => {
  it('giữ requestId trong suốt lời gọi bất đồng bộ', async () => {
    await runWithContext({ requestId: 'req-1' }, async () => {
      await new Promise((resolve) => setTimeout(resolve, 5))
      expect(currentRequestId()).toBe('req-1')
    })
  })

  it('hai context chạy song song không lẫn vào nhau', async () => {
    const seen: string[] = []
    await Promise.all([
      runWithContext({ requestId: 'a' }, async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        seen.push(currentRequestId() ?? 'khong-co')
      }),
      runWithContext({ requestId: 'b' }, async () => {
        seen.push(currentRequestId() ?? 'khong-co')
      }),
    ])
    expect(seen.sort()).toEqual(['a', 'b'])
  })

  it('setContext bổ sung khoá vào context đang chạy', () => {
    runWithContext({ requestId: 'req-2' }, () => {
      setContext({ runId: 'run-9', nonce: 3 })

      // Phải đọc lại đúng những khoá vừa vá. Chỉ kiểm requestId không đổi thì
      // setContext có là hàm rỗng test vẫn xanh — nó không kiểm gì cả.
      expect(getContext()).toEqual({ requestId: 'req-2', runId: 'run-9', nonce: 3 })
    })
  })

  it('setContext ngoài context không nổ và không tạo context mới', () => {
    expect(() => setContext({ runId: 'run-lac' })).not.toThrow()
    expect(getContext()).toBeUndefined()
  })

  it('ngoài context thì không có requestId', () => {
    expect(currentRequestId()).toBeUndefined()
  })
})
