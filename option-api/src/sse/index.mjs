
export async function main (event, context) {
  // 切换到 SSE 模式
  const sse = context.sse()
  console.log(sse, 'sse')

  sse.on('close', () => {
    console.log('sse closed')
  })

  // 发送事件到客户端，发送前先检查是否已经关闭，如未关闭可发送
  if (!sse.closed) {

    sse.send({ data: 'hello from sse function, abcedfg..., €€€€€⭐⭐⭐⭐⭐' })
    sse.send({ data: 'a\n\n\n\nb\r\r\r\rc\n\r\nd' })
    sse.send({ data: { a: 1, b: 2, c: { a:1,b:2 } } })
    sse.send({ data: JSON.stringify({ a: 1, b: 2, c: { a:1,b:2 } }) })
    sse.send({ data: Buffer.from('this is a message in buffer.') })

    sse.send({ data: 0 })
    sse.send({ data: false })
    sse.send({ data: undefined })
    sse.send({ data: null })

    sse.send({ data: 'message with linebreak symbol:\\nThis is the first line.\\n\\nThis is the second line.\\r\\r\\r\n' })

    // 多次发送多个事件
    sse.send({ data: 'This is the first message.' })
    sse.send({ data: 'This is the second message, it\n\r\r\n\r\r\rhas two lines.' })
    sse.send({ data: 'This is the third message.' })

    // 单次发送多个事件
    sse.send([
      { data: 'This is the first message.' },
      { data: 'This is the second message, it\n\r\r\n\r\r\rhas two lines.' },
      { data: 'This is the third message.' }
    ])

    // 以下为发送原始消息的示例
    // 该方式用于扩展 SSE 协议，例如发送其他 Event Field 字段
    // 注意：末尾必须有换行符数据才会立即发送

    sse.send('message: This is a raw message. ')
    sse.send(['message: This is another raw message.\n\n'])

    const msgs = [
      'This is a raw message. \n',
      'This is another raw message.\n\n'
    ]
    sse.send(msgs)

    await new Promise((resolve) => {
      const msgs = [
        '大量的TIME_WAIT连接可能会导致以下问题：\n',
        '1. 占用大量的服务器资源，如内存和文件描述符。\n',
        '2. 如果TIME_WAIT连接过多，可能会耗尽服务器的可用端口，导致服务器无法建立新的连接。\n',
        '3. 由于TCP连接处于半关闭状态，可能会导致网络性能下降。\n\n'
      ]
      let i = 0
      let j = 0
      const timer = setInterval(() => {
        sse.send(msgs[i][j])
        j++
        if (j >= msgs[i].length) {
          j = 0
          i++
          if (i >= msgs.length) {
            clearInterval(timer)
            resolve()
          }
        }
      }, 20)
    })
  }

  // 定时发送消息
  let i = 0
  const timer = setInterval(() => {
    if (!sse.closed) {
      console.log('hasSent-a:', i, sse.send({ id: i++, event: 'server-datetime-a', data: new Date().toISOString() }))
    } else {
      // 如果连接已经关闭，则清除定时器
      clearInterval(timer)
    }
  }, 1000)

  // 等待 定时发送消息 结束
  await new Promise ((resolve) => {
    // 定时发送事件到客户端
    let i = 0
    const timer = setInterval(() => {
      i++
      if (!sse.closed) {
        console.log('hasSent-b:', i, sse.send({ id: i, event: 'server-datetime-b', data: new Date().toISOString() }))
      } else {
        // 如果连接已经关闭，则清除定时器
        clearInterval(timer)
        resolve()
      }
      if (i >= 3) {
        sse.end({ data: 'this is end message, \nbye.' })
        clearInterval(timer)
        resolve()
      }
    }, 3000)
  })

  console.log('function end...')

  // 函数执行时间以函数返回时间计算
  // 函数返回后，HTTP 请求处理完成，函数内的异步逻辑继续进行处理，不影响函数返回时间
  // TCP 网络连接依然被 SEE 占用，直到 SSE 连接被客户端或服务端关闭，可以继续发送消息到客户端
  // SSE协议已经将http转换到长连接模式，需要客户端或服务端在适当的时候主动关闭连接，否则将导致连接一直占用，消耗网络资源
  // 因TCP主动关闭的一方将进入TIME_WAIT状态，大量TIME_WAIT状态的连接将导致网络资源耗尽，无法建立新的连接，所以客户端主动关闭连接时更符合最佳实践的
  // 因客户端可能并不知晓在什么时间关闭连接，服务端可以发送一个特殊的消息，告诉客户端消息已经结束，可以关闭连接了
  return ''
}
