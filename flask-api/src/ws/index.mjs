
export function main (event, context) {
  console.log({ event, context })
  if (context.ws) {
    context.ws.on('close', (msg) => {
      console.log('close: ', msg)
    })
    context.ws.on('message', (msg) => {
      console.log('message: ', msg)
    })
    setInterval(() => {
      context.ws.send(`now: ${new Date().toISOString()}`)
    }, 100)
  }
}

// 支持同步异步
main.handleUpgrade = async function (upgradeContext) {
  console.log(upgradeContext, 'upgradeContext')
  if (upgradeContext.httpContext.url === '/upgrade-handle-throw-error') {
    throw new Error('test throw error')
  } else if (upgradeContext.httpContext.url === '/upgrade-handle-reject-error') {
    return Promise.reject(new Error('test reject error'))
  } else if (upgradeContext.httpContext.url === '/allow-websocket-false') {
    return {
      allowWebSocket: false,
      statusCode: 403,
      body: JSON.stringify({ code: 'code', message: 'message' }),
      contentType: 'appliaction/json; charset=utf-8'
    }
  }
  return { allowWebSocket: true }
}
