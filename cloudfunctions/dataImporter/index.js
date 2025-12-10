// 云函数入口文件
const cloud = require('wx-server-sdk')
const xlsx = require('node-xlsx')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 辅助函数：将Excel的日期数字转换为Date对象
// Excel的日期是从1900-01-01开始的天数
function excelDateToJSDate(serial) {
  if (typeof serial !== 'number') return new Date()
  const utc_days  = Math.floor(serial - 25569);
  const utc_value = utc_days * 86400;                                        
  const date_info = new Date(utc_value * 1000);
  return date_info;
}

// 云函数入口函数
exports.main = async (event, context) => {
  // event.fileID: 云存储中的文件ID (例如: cloud://.../data.xlsx)
  // 如果是通过HTTP调用，也可以在event.fileContent中直接传base64
  
  const fileID = event.fileID
  if (!fileID) {
    return { success: false, msg: 'No fileID provided' }
  }

  try {
    // 1. 下载文件
    const res = await cloud.downloadFile({ fileID: fileID })
    const buffer = res.fileContent

    // 2. 解析Excel
    // sheets是一个数组，每个元素代表一个Sheet: { name: 'Sheet1', data: [[row1], [row2], ...] }
    const sheets = xlsx.parse(buffer)
    const sheet1 = sheets[0].data

    // 假设第一行是表头
    // [ '代码', '名称', '现价', '涨跌幅', '日期' ]
    const headers = sheet1[0]
    const rows = sheet1.slice(1)
    
    // 映射表头到数据库字段 (需要根据你实际的Excel表头修改)
    const fieldMap = {
      '代码': 'code',
      '名称': 'name',
      '现价': 'price',
      '涨跌幅': 'changePercent',
      '日期': 'date',
      // ... 其他字段
    }

    const tasks = []
    const batchSize = 100 // 数据库单次批量插入限制
    let batchData = []

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      if (!row || row.length === 0) continue

      let doc = {}
      headers.forEach((header, index) => {
        const dbField = fieldMap[header] || header // 如果没有映射，就用原名
        let value = row[index]

        // 特殊处理：如果字段是日期，且Excel解析出来是数字
        if (dbField === 'date' && typeof value === 'number') {
          value = excelDateToJSDate(value)
        }
        
        doc[dbField] = value
      })
      
      // 添加更新时间
      doc.updateTime = db.serverDate()
      
      batchData.push(doc)

      // 批量写入
      if (batchData.length >= batchSize) {
        // 这里演示的是直接add(插入)，如果是更新(upsert)，逻辑会复杂一些，通常建议用云函数循环update或先删后加
        // 考虑到每日数据可能是“最新行情”，这里假设是插入历史记录或更新最新表
        // 为了演示简单，我们往 'imported_data' 集合里插
        const promise = db.collection('quotes').add({ data: batchData })
        tasks.push(promise)
        batchData = []
      }
    }

    // 处理剩余的
    if (batchData.length > 0) {
      tasks.push(db.collection('quotes').add({ data: batchData }))
    }

    // 等待所有写入完成
    await Promise.all(tasks)

    return {
      success: true,
      totalRows: rows.length,
      msg: 'Import complete'
    }

  } catch (err) {
    console.error(err)
    return {
      success: false,
      error: err.message
    }
  }
}
