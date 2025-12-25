import { describe, expect, it } from 'vitest'
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { getApiErrorMessage } from './api'

describe('getApiErrorMessage', () => {
  it('returns userMessage when attached', () => {
    const error = { userMessage: 'hello' }
    expect(getApiErrorMessage(error, 'fallback')).toBe('hello')
  })

  it('returns network message for axios error without response', () => {
    const error = new AxiosError(
      'Network Error',
      'ERR_NETWORK',
      { url: '/x', headers: {} } as unknown as InternalAxiosRequestConfig,
    )
    expect(getApiErrorMessage(error, 'fallback')).toBe('无法连接到 API 服务：请确认后端已启动且端口配置正确')
  })

  it('returns server message for 502 response', () => {
    const config = { url: '/x', headers: {} } as unknown as InternalAxiosRequestConfig
    const response = {
      status: 502,
      statusText: 'Bad Gateway',
      headers: {},
      config,
      data: { message: 'API 服务不可用：后端不可达' },
    } as unknown as AxiosResponse

    const error = new AxiosError(
      'Bad Gateway',
      'ERR_BAD_RESPONSE',
      config,
      undefined,
      response,
    )
    expect(getApiErrorMessage(error, 'fallback')).toBe('API 服务不可用：后端不可达')
  })

  it('falls back when unknown error', () => {
    expect(getApiErrorMessage(null, 'fallback')).toBe('fallback')
  })
})
