import tcb from '@cloudbase/node-sdk'

export const main = async function(event, context) {
  console.log({event, context})

  const tcbapp = tcb.init({
    keepalive: true,
    protocol: 'http',
    context: context
  })

  try {
    await uploadFile(tcbapp)
  } catch (e) {
    console.error(e, 'uploadFile.error')
  }

  try {
    dbUpdate(tcbapp)
  } catch (e) {
    console.error(e, 'dbUpdate.error')
  }

  return 'done'
}

export async function getTempFileURL(tcbapp, fileID) {
  await tcbapp.getTempFileURL({fileList: [fileID]}).then(result => {
    console.log(result, 'result')
  })
}

export async function uploadFile(tcbapp) {
  const result1 = await tcbapp.uploadFile({
    cloudPath: 'test.txt',
    fileContent: Buffer.from('test')
  })

  return await tcbapp.getTempFileURL({fileList: [result1.fileID]})
}

export async function dbUpdate(tcbapp) {
  // 注意：执行成功需手动创建 articles 集合
  const result = await tcbapp
    .database()
    .collection('articles')
    .where({
      _id: 'not-exists-id'
    })
    .options({ multiple: true })
    .update({ 'a.b.c': 'a.b.c' })

  return result
}
