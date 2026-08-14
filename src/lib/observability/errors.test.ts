// src/lib/observability/errors.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { reportError, setErrorReporter } from './errors'
import { runWithContext } from './request-context'

afterEach(() => setErrorReporter(null))

describe('reportError', () => {
  it('không nổ khi chưa cấu hình nhà cung cấp nào', () => {
    expect(() => reportError(new Error('bùm'))).not.toThrow()
  })

  it('chuyển lỗi kèm khoá tương quan sang nhà cung cấp', () => {
    const reporter = vi.fn()
    setErrorReporter(reporter)

    runWithContext({ requestId: 'req-7', playerId: 'p-1', runId: 'r-1' }, () => {
      reportError(new Error('bùm'), { runCode: 'JKN-AAAA-0001' })
    })

    expect(reporter).toHaveBeenCalledOnce()
    const [, tags] = reporter.mock.calls[0]
    expect(tags).toMatchObject({ requestId: 'req-7', playerId: 'p-1', runId: 'r-1', runCode: 'JKN-AAAA-0001' })
  })

  it('bỏ qua tag rỗng thay vì gửi chuỗi undefined', () => {
    const reporter = vi.fn()
    setErrorReporter(reporter)

    reportError(new Error('bùm'), { runCode: undefined })

    expect(reporter.mock.calls[0][1]).not.toHaveProperty('runCode')
  })

  it('không bao giờ gửi seed ra ngoài dù người gọi có truyền vào', () => {
    const reporter = vi.fn()
    setErrorReporter(reporter)

    reportError(new Error('bùm'), {
      serverSeed: 'BI-MAT-TUYET-DOI',
      ServerSeed: 'BI-MAT-HOA-THUONG',
      runCode: 'JKN-AAAA-0001',
    })

    const [, tags] = reporter.mock.calls[0]
    expect(JSON.stringify(tags)).not.toContain('BI-MAT')
    // Vẫn phải giữ những tag lành tính, nếu không việc chặn thành ra vô dụng.
    expect(tags).toMatchObject({ runCode: 'JKN-AAAA-0001' })
  })

  it('chặn cả biến thể tên khoá, không chỉ đúng chữ serverSeed', () => {
    const reporter = vi.fn()
    setErrorReporter(reporter)

    // Danh sách so khớp bằng đúng tên buộc phải đoán trước mọi cách đặt tên —
    // và người thêm tag mới lúc đang truy một sự cố thì không tra danh sách.
    reportError(new Error('bùm'), {
      seedHex: 'BI-MAT-1',
      serverSeedHash: 'BI-MAT-2',
      SEED_GOC: 'BI-MAT-3',
      adminSecretToken: 'BI-MAT-4',
      runCode: 'JKN-AAAA-0001',
    })

    const [, tags] = reporter.mock.calls[0]
    expect(JSON.stringify(tags)).not.toContain('BI-MAT')
    expect(Object.keys(tags)).toEqual(['runCode'])
  })

  it('lỗi trong chính nhà cung cấp không làm hỏng request', () => {
    setErrorReporter(() => {
      throw new Error('sentry sập')
    })
    expect(() => reportError(new Error('bùm'))).not.toThrow()
  })
})
