/**
 * 测试数据清理云函数
 * 用于清理测试账户和示例数据，确保生产环境数据清洁
 * 
 * 功能：
 * 1. 清理测试用户（标记为 test、demo、example 等关键字的账户）
 * 2. 清理示例询价数据
 * 3. 清理测试持仓数据
 * 4. 清理测试分组数据
 * 
 * 安全机制：
 * - 需要 confirm=true 才会实际执行删除
 * - 默认 dryRun=true 只返回统计信息
 * - 批量删除，每次最多 20 条
 */

const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

// 批量删除限制
const BATCH_DELETE_LIMIT = 20

/**
 * 测试账户识别规则
 * 1. 用户名包含 test、demo、example、测试、示例 等关键字
 * 2. openid 以 'test_' 或 'demo_' 开头
 * 3. nickname 包含测试相关关键字
 * 4. 明确标记为 isTest: true 的账户
 */
const TEST_USER_PATTERNS = [
  'test',
  'demo',
  'example',
  '测试',
  '示例',
  'sample',
  'tmp_',
  'temp_'
]

/**
 * 示例询价识别规则
 * 1. productName 包含测试关键字
 * 2. 明确标记为 isTestData: true
 * 3. contactName 包含测试关键字
 */
const TEST_INQUIRY_PATTERNS = [
  '测试',
  'test',
  'demo',
  '示例',
  'example'
]

/**
 * 分批删除满足条件的记录
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

/**
 * 统计测试用户数量
 */
async function countTestUsers() {
  const patterns = TEST_USER_PATTERNS.map(p => ({
    nickname: db.RegExp({
      regexp: p,
      options: 'i'
    })
  }))

  // 添加 openid 以 test_ 或 demo_ 开头的条件
  patterns.push({
    openid: db.RegExp({
      regexp: '^(test_|demo_)',
      options: 'i'
    })
  })

  // 添加明确标记为测试账户的条件
  patterns.push({ isTest: true })

  const result = await db.collection('users')
    .where(_.or(patterns))
    .count()

  return result.total
}

/**
 * 统计示例询价数量
 */
async function countTestInquiries() {
  const patterns = TEST_INQUIRY_PATTERNS.map(p => ({
    productName: db.RegExp({
      regexp: p,
      options: 'i'
    })
  }))

  patterns.push({
    contactName: db.RegExp({
      regexp: '测试|test|demo',
      options: 'i'
    })
  })

  patterns.push({ isTestData: true })

  const result = await db.collection('inquiries')
    .where(_.or(patterns))
    .count()

  return result.total
}

/**
 * 统计测试持仓数量
 */
async function countTestPositions() {
  const result = await db.collection('positions')
    .where(_.or([
      { isTest: true },
      { isTestData: true },
      {
        productName: db.RegExp({
          regexp: '测试|test|demo',
          options: 'i'
        })
      }
    ]))
    .count()

  return result.total
}

/**
 * 统计测试分组数量
 */
async function countTestGroups() {
  const result = await db.collection('groups')
    .where(_.or([
      { isTest: true },
      {
        name: db.RegExp({
          regexp: '测试|test|demo',
          options: 'i'
        })
      }
    ]))
    .count()

  return result.total
}

/**
 * 删除测试用户
 */
async function deleteTestUsers() {
  const patterns = TEST_USER_PATTERNS.map(p => ({
    nickname: db.RegExp({
      regexp: p,
      options: 'i'
    })
  }))

  patterns.push({
    openid: db.RegExp({
      regexp: '^(test_|demo_)',
      options: 'i'
    })
  })

  patterns.push({ isTest: true })

  return await batchRemove('users', _.or(patterns))
}

/**
 * 删除示例询价
 */
async function deleteTestInquiries() {
  const patterns = TEST_INQUIRY_PATTERNS.map(p => ({
    productName: db.RegExp({
      regexp: p,
      options: 'i'
    })
  }))

  patterns.push({
    contactName: db.RegExp({
      regexp: '测试|test|demo',
      options: 'i'
    })
  })

  patterns.push({ isTestData: true })

  return await batchRemove('inquiries', _.or(patterns))
}

/**
 * 删除测试持仓
 */
async function deleteTestPositions() {
  return await batchRemove('positions', _.or([
    { isTest: true },
    { isTestData: true },
    {
      productName: db.RegExp({
        regexp: '测试|test|demo',
        options: 'i'
      })
    }
  ]))
}

/**
 * 删除测试分组
 */
async function deleteTestGroups() {
  return await batchRemove('groups', _.or([
    { isTest: true },
    {
      name: db.RegExp({
        regexp: '测试|test|demo',
        options: 'i'
      })
    }
  ]))
}

/**
 * 清理本地存储中的默认自选数据（通过返回清理指令）
 */
function getLocalStorageCleanupInstructions() {
  return {
    storageKeys: [
      'INQUIRY_FAVORITES_V1',
      'INQUIRY_CUSTOM_GROUPS_V1',
      'favorites'
    ],
    defaultDataPatterns: [
      { name: '宁德时代', code: '300750' },
      { name: '东方财富', code: '300059' },
      { name: '平安银行', code: '000001' },
      { name: '药明康德', code: '603259' },
      { name: '上海贝岭', code: '603259' }
    ],
    instruction: '前端应在用户首次登录真实账户时清理这些默认数据'
  }
}

// 云函数入口函数
exports.main = async (event) => {
  const dryRun = event?.dryRun !== false // 默认为试运行模式
  const confirm = event?.confirm === true // 需要明确确认才执行删除
  const cleanupUsers = event?.cleanupUsers !== false
  const cleanupInquiries = event?.cleanupInquiries !== false
  const cleanupPositions = event?.cleanupPositions !== false
  const cleanupGroups = event?.cleanupGroups !== false

  console.log(`开始数据清理检查: dryRun=${dryRun}, confirm=${confirm}`)

  try {
    // 1. 统计各类测试数据
    const counts = {
      users: 0,
      inquiries: 0,
      positions: 0,
      groups: 0
    }

    if (cleanupUsers) {
      counts.users = await countTestUsers()
    }
    if (cleanupInquiries) {
      counts.inquiries = await countTestInquiries()
    }
    if (cleanupPositions) {
      counts.positions = await countTestPositions()
    }
    if (cleanupGroups) {
      counts.groups = await countTestGroups()
    }

    const totalTestData = counts.users + counts.inquiries + counts.positions + counts.groups

    // 如果是试运行模式或未确认，只返回统计信息
    if (dryRun || !confirm) {
      return {
        success: true,
        message: '数据清理检查完成（试运行模式，未实际删除）',
        data: {
          dryRun: true,
          confirmed: false,
          counts,
          totalTestData,
          localStorageCleanup: getLocalStorageCleanupInstructions(),
          hint: '设置 confirm=true 并 dryRun=false 以实际执行删除'
        }
      }
    }

    // 2. 执行删除
    const deleted = {
      users: 0,
      inquiries: 0,
      positions: 0,
      groups: 0
    }

    console.log('开始删除测试数据...')

    if (cleanupUsers && counts.users > 0) {
      deleted.users = await deleteTestUsers()
      console.log(`删除测试用户: ${deleted.users} 条`)
    }

    if (cleanupInquiries && counts.inquiries > 0) {
      deleted.inquiries = await deleteTestInquiries()
      console.log(`删除示例询价: ${deleted.inquiries} 条`)
    }

    if (cleanupPositions && counts.positions > 0) {
      deleted.positions = await deleteTestPositions()
      console.log(`删除测试持仓: ${deleted.positions} 条`)
    }

    if (cleanupGroups && counts.groups > 0) {
      deleted.groups = await deleteTestGroups()
      console.log(`删除测试分组: ${deleted.groups} 条`)
    }

    const totalDeleted = deleted.users + deleted.inquiries + deleted.positions + deleted.groups

    return {
      success: true,
      message: `数据清理完成，共删除 ${totalDeleted} 条测试数据`,
      data: {
        dryRun: false,
        confirmed: true,
        before: counts,
        deleted,
        totalDeleted,
        localStorageCleanup: getLocalStorageCleanupInstructions()
      }
    }

  } catch (err) {
    console.error('数据清理失败:', err)
    return {
      success: false,
      message: '数据清理失败: ' + (err.message || '未知错误'),
      error: err.message
    }
  }
}