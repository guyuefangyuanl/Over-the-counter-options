import WebSocket from 'ws'

function run () {
  const ws = new WebSocket('ws://127.0.0.1:3000/')

  ws.on('close', (code, reason) => {
    console.log('close:', code, `${reason}`)
  })
  ws.on('error', (err) => {
    console.error('error: ', err)
  })
  ws.on('upgrade', () => {
    console.log('upgrade')
  })
  ws.on('ping', () => {
    console.log('recv ping message')
  })
  ws.on('pong', () => {
    console.log('recv pong message')
    setTimeout(() => {
      ws.ping()
    }, 1000)
  })
  ws.on('unexpected-response', (ws, req, res) => {
    // 非 upgrade 响应和 3xx 重定向响应认为是 unexpected-response
    console.log('recv unexpected-response message')
  })

  ws.on('message', (data) => {
    console.log('received: %s', data)
  })

  ws.on('open', () => {
    ws.ping()
    ws.send('string data')
    ws.send(Buffer.from('buffer data'))
  })
}

run()
