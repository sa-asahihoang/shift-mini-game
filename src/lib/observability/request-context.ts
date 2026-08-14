// src/lib/observability/request-context.ts
import { AsyncLocalStorage } from 'node:async_hooks'

export interface RequestContext {
  requestId: string
  playerId?: string
  runId?: string
  nonce?: number
}

const storage = new AsyncLocalStorage<RequestContext>()

/**
 * Chạy một request trong context riêng. Mọi dòng log bên trong tự mang đủ khoá
 * tương quan mà không phải truyền tay qua từng hàm.
 */
export function runWithContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run({ ...context }, fn)
}

export function setContext(patch: Partial<RequestContext>): void {
  const current = storage.getStore()
  if (current) Object.assign(current, patch)
}

export function getContext(): RequestContext | undefined {
  return storage.getStore()
}

export function currentRequestId(): string | undefined {
  return storage.getStore()?.requestId
}
