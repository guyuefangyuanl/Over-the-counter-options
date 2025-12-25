import { defineConfig, loadEnv, type ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const repoRoot = path.resolve(__dirname, '..')
  const env = loadEnv(mode, repoRoot, '')

  const nodeEnv = env.NODE_ENV || 'development'
  const rawFlaskPort = env.PORT || env.FLASK_PORT || '5000'
  const parsedPort = Number.parseInt(rawFlaskPort, 10)
  const flaskPort =
    nodeEnv === 'development' && Number.isFinite(parsedPort) && parsedPort > 0 && parsedPort < 1024
      ? 5000
      : Number.isFinite(parsedPort) && parsedPort > 0
        ? parsedPort
        : 5000

  const proxyTarget = env.VITE_API_PROXY_TARGET || `http://127.0.0.1:${flaskPort}`

  const apiProxy: ProxyOptions = {
    target: proxyTarget,
    changeOrigin: true,
    configure: (proxy) => {
      proxy.on('error', (err, req, res) => {
        void req
        const socketRes = res as unknown as {
          writableEnded?: boolean
          statusCode?: number
          setHeader?: (name: string, value: string) => void
          end?: (body?: string) => void
        }

        if (socketRes.writableEnded) return

        const message =
          nodeEnv === 'development'
            ? `API 代理连接失败：请确认后端已启动。当前代理目标: ${proxyTarget}`
            : 'API 服务不可用'

        socketRes.statusCode = 502
        socketRes.setHeader?.('Content-Type', 'application/json; charset=utf-8')
        socketRes.end?.(
          JSON.stringify({
            success: false,
            code: 502,
            message,
            data: {
              target: proxyTarget,
              error: err instanceof Error ? err.message : String(err),
            },
          }),
        )
      })
    },
  }

  return {
    envDir: repoRoot,
    plugins: [react()],
    base: '/admin/',
    resolve: {
      dedupe: ['react', 'react-dom'],
    },
    server: {
      proxy: {
        '/api': apiProxy,
      },
    },
  }
})
