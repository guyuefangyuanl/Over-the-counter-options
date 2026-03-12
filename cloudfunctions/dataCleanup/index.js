/**
 * 数据清理云函数
 * 定时清理过期的 error_logs 和 import_jobs 记录
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const DEFAULT_ERROR_LOG_RETAIN_DAYS = 30
const DEFAULT_IMPORT_JOB_RETAIN_DAYS = 90
// 云数据库单次 remove 最多删除 20 条
const BATCH_DELETE_LIMIT = 20

/**
 * 分批删除满足条件的记录
 * @param {string} collection 集合名
 * @param {Object} where 查询条件
 * @returns {number} 删除总数
 */
async function batchRemove(collection, where) {
  let totalDeleted = 0
  let hasMore = true

  while (hasMore) {
    const res = await db.collection(collection).where(where).limit(BATCH_DELETE_LIMIT).remove()
    const deleted = res.stats.removed || 0
    totalDeleted += deleted
    hasMore = deleted >= BATCH_DELETE_LIMIT
  }

  return totalDeleted
}

exports.main = async (event) => {
  const dryRun = event?.dryRun === true
  const errorLogRetainDays = parseInt(event?.errorLogRetainDays) || DEFAULT_ERROR_LOG_RETAIN_DAYS
  const importJobRetainDays = parseInt(event?.importJobRetainDays) || DEFAULT_IMPORT_JOB_RETAIN_DAYS

  const errorLogCutoff = new Date(Date.now() - errorLogRetainDays * 86400000)
  const importJobCutoff = new Date(Date.now() - importJobRetainDays * 86400000)

  try {
    // 统计待清理记录数
    const [errorLogCount, importJobCount] = await Promise.all([
      db.collection('error_logs').where({
        createdAt: _.lt(errorLogCutoff)
      }).count(),
      db.collection('import_jobs').where({
        status: _.in(['success', 'failed', 'skipped']),
        finishedAt: _.lt(importJobCutoff)
      }).count()
    ])

    console.log(`待清理: error_logs=${errorLogCount.total}, import_jobs=${importJobCount.total}, dryRun=${dryRun}`)

    if (dryRun) {
      return {
        success: true,
        message: '试运行完成（未实际删除）',
        data: {
          errorLogsToDelete: errorLogCount.total,
          importJobsToDelete: importJobCount.total,
          dryRun: true
        }
      }
    }

    // 执行分批删除
    const [errorLogsDeleted, importJobsDeleted] = await Promise.all([
      batchRemove('error_logs', { createdAt: _.lt(errorLogCutoff) }),
      batchRemove('import_jobs', {
        status: _.in(['success', 'failed', 'skipped']),
        finishedAt: _.lt(importJobCutoff)
      })
    ])

    const msg = `清理完成: error_logs删除${errorLogsDeleted}条, import_jobs删除${importJobsDeleted}条`
    console.log(msg)

    return {
      success: true,
      message: msg,
      data: {
        errorLogsDeleted,
        importJobsDeleted,
        dryRun: false
      }
    }
  } catch (err) {
    console.error('dataCleanup 失败:', err)
    return {
      success: false,
      message: '数据清理失败: ' + (err.message || '未知错误')
    }
  }
}
