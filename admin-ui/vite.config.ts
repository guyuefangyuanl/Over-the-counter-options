import { defineConfig, loadEnv, type ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const repoRoot = path.resolve(__dirname, '..')
  const env = loadEnv(mode, repoRoot, '')

  const nodeEnv = env.NODE_ENV || mode
  const flaskPort = Number.parseInt(env.FLASK_PORT || '5002', 10)
  const cloudProxyTarget = 'https://flask-ym1v-210758-7-1374336462.sh.run.tcloudbase.com'
  const localProxyTarget = `http://127.0.0.1:${flaskPort}`
  const proxyMode = (env.VITE_PROXY_MODE || '').toLowerCase()
  const proxyTarget = proxyMode === 'local' ? localProxyTarget : cloudProxyTarget

  if (nodeEnv === 'development') {
    console.log(`[vite] API 代理目标: ${proxyTarget}`)
  }

  const apiProxy: ProxyOptions = {
    target: proxyTarget,
    changeOrigin: true,
    proxyTimeout: 300000,
    timeout: 300000,
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
// Trigger reload
    },
  }

  return {
    envDir: repoRoot,
    plugins: [react()],
    base: '/',
    resolve: {
      dedupe: ['react', 'react-dom'],
    },
    test: {
      environment: 'jsdom',
    },
    server: {
      proxy: {
        '/api': apiProxy,
      },
    },
  }
})
