/**
 * 静态资源路由
 * 处理图片、文件等静态资源的访问
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();

// 支持的图片格式
const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico'];

/**
 * 图片资源处理
 */
router.get('/images/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const ext = path.extname(filename).toLowerCase();
    
    if (!imageExtensions.includes(ext)) {
      return res.status(400).json({
        success: false,
        message: '不支持的图片格式'
      });
    }

    // 图片查找优先级：
    // 1. 根目录images文件夹
    // 2. 子目录中的图片
    // 3. 默认占位图片
    
    const imagePaths = [
      path.join(__dirname, '../../images', filename),
      path.join(__dirname, '../../images/icons', filename),
      path.join(__dirname, '../../images/首页', filename),
      path.join(__dirname, '../../images/我的', filename),
      path.join(__dirname, '../../images/工作台', filename)
    ];
    
    // 查找现有图片
    for (const imagePath of imagePaths) {
      if (fs.existsSync(imagePath)) {
        const mimeTypes = {
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.gif': 'image/gif',
          '.svg': 'image/svg+xml',
          '.webp': 'image/webp',
          '.ico': 'image/x-icon'
        };
        
        res.setHeader('Content-Type', mimeTypes[ext] || 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=86400'); // 缓存1天
        
        return res.sendFile(imagePath);
      }
    }

    // 如果找不到文件，返回默认图片
    console.log(`图片文件不存在: ${filename}，返回默认图片`);
    
    // 根据文件名返回不同的默认图片
    const defaultImages = {
      'default-avatar.png': createDefaultAvatar(),
      'signal1.png': createSignalIcon(),
      'signal2.png': createSignalIcon(),
      'battery.png': createBatteryIcon(),
      'arrow-right.png': createArrowIcon(),
      'home.png': createHomeIcon(),
      'inquiry.png': createInquiryIcon(),
      'account-active.png': createAccountIcon(),
      'profile.png': createProfileIcon(),
      // 添加缺失的图标
      'icon_entry_1.png': createEntryIcon(1),
      'icon_entry_2.png': createEntryIcon(2),
      'icon_entry_3.png': createEntryIcon(3),
      'icon_entry_4.png': createEntryIcon(4),
      'icon_search.png': createSearchIcon(),
      'icon_info.png': createInfoIcon(),
      'icon_support.png': createSupportIcon(),
      'icon_star_empty.png': createStarEmptyIcon(),
      'star.png': createStarEmptyIcon()
    };
    
    const defaultImage = defaultImages[filename] || createDefaultIcon();
    
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=3600'); // 缓存1小时
    res.send(defaultImage);

  } catch (error) {
    console.error('图片服务错误:', error);
    res.status(500).json({
      success: false,
      message: '图片服务错误'
    });
  }
});

/**
 * 上传文件处理
 */
router.get('/uploads/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, '../uploads', filename);
    
    if (fs.existsSync(filePath)) {
      return res.sendFile(filePath);
    }
    
    res.status(404).json({
      success: false,
      message: '文件不存在'
    });

  } catch (error) {
    console.error('文件服务错误:', error);
    res.status(500).json({
      success: false,
      message: '文件服务错误'
    });
  }
});

/**
 * 获取图片列表
 */
router.get('/images', (req, res) => {
  try {
    const imagesDir = path.join(__dirname, '../../images');
    
    if (!fs.existsSync(imagesDir)) {
      return res.json({
        success: true,
        data: []
      });
    }

    const files = fs.readdirSync(imagesDir);
    const images = files.filter(file => {
      const ext = path.extname(file).toLowerCase();
      return imageExtensions.includes(ext);
    }).map(file => ({
      filename: file,
      url: `/images/${file}`,
      size: fs.statSync(path.join(imagesDir, file)).size
    }));

    res.json({
      success: true,
      data: images
    });

  } catch (error) {
    console.error('获取图片列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取图片列表失败'
    });
  }
});

// 默认图标生成函数
function createDefaultIcon() {
  return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="24" height="24" fill="#f0f0f0" rx="4"/>
    <circle cx="12" cy="12" r="4" fill="#ccc"/>
  </svg>`;
}

function createDefaultAvatar() {
  return `<svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="32" cy="32" r="32" fill="#e0e0e0"/>
    <circle cx="32" cy="24" r="8" fill="#bbb"/>
    <path d="M16 52c0-8.837 7.163-16 16-16s16 7.163 16 16v4H16v-4z" fill="#bbb"/>
  </svg>`;
}

function createSignalIcon() {
  return `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="1" y="12" width="2" height="3" fill="#333"/>
    <rect x="4" y="10" width="2" height="5" fill="#333"/>
    <rect x="7" y="8" width="2" height="7" fill="#333"/>
    <rect x="10" y="6" width="2" height="9" fill="#333"/>
    <rect x="13" y="4" width="2" height="11" fill="#333"/>
  </svg>`;
}

function createBatteryIcon() {
  return `<svg width="24" height="12" viewBox="0 0 24 12" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="1" y="2" width="20" height="8" stroke="#333" stroke-width="1" fill="none" rx="1"/>
    <rect x="21" y="4" width="2" height="4" fill="#333" rx="1"/>
    <rect x="2" y="3" width="16" height="6" fill="#4caf50" rx="1"/>
  </svg>`;
}

function createArrowIcon() {
  return `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M6 4l4 4-4 4" stroke="#666" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

function createInfoIcon() {
  return `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="8" cy="8" r="7" stroke="#007aff" stroke-width="1" fill="none"/>
    <circle cx="8" cy="5" r="1" fill="#007aff"/>
    <line x1="8" y1="7" x2="8" y2="11" stroke="#007aff" stroke-width="1.5" stroke-linecap="round"/>
  </svg>`;
}

function createHomeIcon() {
  return `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 7l7-4 7 4v11a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" stroke="#666" stroke-width="1.5" fill="none"/>
    <polyline points="9,20 9,12 11,12 11,20" stroke="#666" stroke-width="1.5" fill="none"/>
  </svg>`;
}

function createInquiryIcon() {
  return `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="10" cy="10" r="8" stroke="#007aff" stroke-width="1.5" fill="none"/>
    <path d="M10 6a4 4 0 00-4 4" stroke="#007aff" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    <circle cx="10" cy="14" r="1" fill="#007aff"/>
  </svg>`;
}

function createAccountIcon() {
  return `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="10" cy="7" r="4" stroke="#007aff" stroke-width="1.5" fill="none"/>
    <path d="M4 19v-2a4 4 0 014-4h4a4 4 0 014 4v2" stroke="#007aff" stroke-width="1.5" fill="none"/>
  </svg>`;
}

function createProfileIcon() {
  return `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="10" cy="6" r="3" stroke="#666" stroke-width="1.5" fill="none"/>
    <path d="M5 17v-1a4 4 0 014-4h2a4 4 0 014 4v1" stroke="#666" stroke-width="1.5" fill="none"/>
  </svg>`;
}

function createEntryIcon(number) {
  return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="24" height="24" fill="#f0f0f0" rx="4"/>
    <text x="12" y="16" font-family="Arial" font-size="14" text-anchor="middle" fill="#666">${number}</text>
  </svg>`;
}

function createSearchIcon() {
  return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="11" cy="11" r="7" stroke="#666" stroke-width="2" fill="none"/>
    <line x1="21" y1="21" x2="16.65" y2="16.65" stroke="#666" stroke-width="2" stroke-linecap="round"/>
  </svg>`;
}

function createSupportIcon() {
  return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="9" stroke="#666" stroke-width="2" fill="none"/>
    <circle cx="12" cy="12" r="1" fill="#666"/>
    <path d="M12 8v5" stroke="#666" stroke-width="2" stroke-linecap="round"/>
    <path d="M8 12h8" stroke="#666" stroke-width="2" stroke-linecap="round"/>
  </svg>`;
}

function createStarEmptyIcon() {
  return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <polygon points="12,2 15,9 22,9 17,14 19,22 12,18 5,22 7,14 2,9 9,9" 
             stroke="#666" stroke-width="2" fill="none"/>
  </svg>`;
}

module.exports = router;