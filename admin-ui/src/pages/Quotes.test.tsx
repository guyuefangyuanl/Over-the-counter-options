import React from 'react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { createRoot } from 'react-dom/client'
import { act } from 'react'

import Quotes from './Quotes'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const hoisted = vi.hoisted(() => {
  return {
    message: {
      success: vi.fn(),
      error: vi.fn(),
    },
    apiGet: vi.fn(),
    apiPost: vi.fn(),
  }
})

vi.mock('@ant-design/icons', () => {
  return {
    UploadOutlined: () => null,
    ReloadOutlined: () => null,
    DeleteOutlined: () => null,
  }
})

vi.mock('antd', async () => {
  const React = (await import('react')).default
  return {
    App: { useApp: () => ({ message: hoisted.message }) },
    Table: (props: { children?: React.ReactNode }) => <div data-testid="table">{props.children}</div>,
    Empty: (props: { description?: React.ReactNode }) => <div data-testid="empty">{props.description}</div>,
    Spin: () => <div data-testid="spin" />,
    Result: (props: { extra?: React.ReactNode }) => <div data-testid="result">{props.extra}</div>,
    Button: (props: {
      onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void
      children?: React.ReactNode
      disabled?: boolean
      loading?: boolean
    }) => (
      <button
        type="button"
        disabled={Boolean(props.disabled || props.loading)}
        data-loading={props.loading ? '1' : '0'}
        onClick={props.onClick}
      >
        {props.children}
      </button>
    ),
    Upload: (props: { children?: React.ReactNode }) => <div>{props.children}</div>,
    Card: (props: { children?: React.ReactNode }) => <div>{props.children}</div>,
    Space: (props: { children?: React.ReactNode }) => <div>{props.children}</div>,
    Modal: (props: { open?: boolean; children?: React.ReactNode }) =>
      props.open ? <div data-testid="modal">{props.children}</div> : null,
    Typography: {
      Title: (props: { children?: React.ReactNode }) => <h1>{props.children}</h1>,
    },
  }
})

vi.mock('../utils/api', () => {
  return {
    default: {
      get: hoisted.apiGet,
      post: hoisted.apiPost,
    },
    getApiErrorMessage: (_err: unknown, fallback: string) => fallback,
  }
})

function getButtonByText(container: HTMLElement, text: string) {
  const buttons = Array.from(container.querySelectorAll('button'))
  const btn = buttons.find((b) => (b.textContent || '').includes(text))
  if (!btn) throw new Error(`button not found: ${text}`)
  return btn
}

describe('Quotes page crawl button', () => {
  beforeEach(() => {
    hoisted.message.success.mockReset()
    hoisted.message.error.mockReset()
    hoisted.apiGet.mockReset()
    hoisted.apiPost.mockReset()
    hoisted.apiGet.mockResolvedValue({ success: true, data: [] })
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.useRealTimers()
  })

  it('clicking crawl only triggers crawl endpoint and does not bubble', async () => {
    hoisted.apiPost.mockResolvedValue({ success: true, data: { processed: 1 }, message: 'OK' })

    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    const parentClick = vi.fn()

    await act(async () => {
      root.render(
        <div onClick={parentClick}>
          <Quotes />
        </div>,
      )
    })

    expect(hoisted.apiGet).toHaveBeenCalledWith('/admin/quotes', { params: { page: 1, pageSize: 10 } })

    const crawlBtn = getButtonByText(container, '从新浪同步最新行情')
    await act(async () => {
      crawlBtn.click()
    })

    expect(parentClick).not.toHaveBeenCalled()
    expect(hoisted.apiPost).toHaveBeenCalledTimes(1)
    expect(hoisted.apiPost.mock.calls[0]?.[0]).toBe('/admin/sync-quotes')
  })

  it('refresh button still works after crawl completes', async () => {
    hoisted.apiPost.mockResolvedValue({ success: true, data: { processed: 1 }, message: 'OK' })

    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(<Quotes />)
    })

    const crawlBtn = getButtonByText(container, '从新浪同步最新行情')
    await act(async () => {
      crawlBtn.click()
    })

    const refreshBtn = getButtonByText(container, '刷新')
    await act(async () => {
      refreshBtn.click()
    })

    expect(hoisted.apiGet).toHaveBeenCalledTimes(3)
  })

  it('does not block the event loop when crawl is in-flight', async () => {
    vi.useFakeTimers()
    hoisted.apiPost.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ success: true, data: { processed: 1 }, message: 'OK' }), 50)
        }),
    )

    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(<Quotes />)
    })

    let ticked = false
    setTimeout(() => {
      ticked = true
    }, 0)

    const crawlBtn = getButtonByText(container, '从新浪同步最新行情')
    await act(async () => {
      crawlBtn.click()
    })

    expect(ticked).toBe(false)
    vi.advanceTimersByTime(0)
    expect(ticked).toBe(true)
  })
})
