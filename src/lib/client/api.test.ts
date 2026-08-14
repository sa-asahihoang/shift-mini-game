// src/lib/client/api.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiPlayRound, apiStartRun } from './api'

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('lớp gọi API', () => {
  it('trả về body khi thành công', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { runId: 'r1', commitment: 'abc' }))
    await expect(apiStartRun()).resolves.toMatchObject({ runId: 'r1' })
  })

  it('gửi clientSeed người chơi nhập', async () => {
    const fetchMock = mockFetch(200, { runId: 'r1' })
    vi.stubGlobal('fetch', fetchMock)

    await apiStartRun('hat-giong-cua-toi')

    const [, init] = fetchMock.mock.calls[0]
    expect(JSON.parse(init.body)).toEqual({ clientSeed: 'hat-giong-cua-toi' })
  })

  it('ném ApiError mang mã lỗi khi server từ chối', async () => {
    vi.stubGlobal('fetch', mockFetch(409, { error: 'nonce_mismatch', message: 'sai thứ tự ván' }))

    await expect(apiPlayRound('r1', 0, 3)).rejects.toMatchObject({
      code: 'nonce_mismatch',
      status: 409,
    })
    expect(new ApiError('x', 400, 'y')).toBeInstanceOf(Error)
  })

  it('ném ApiError khi server trả body không phải JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('sập', { status: 502 })))
    await expect(apiStartRun()).rejects.toMatchObject({ status: 502 })
  })
})
