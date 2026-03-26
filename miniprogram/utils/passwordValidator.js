/**
 * 密码强度验证工具
 * 
 * 用于前端实时验证密码强度，与后端规则保持一致
 */

const PasswordValidator = {
  // 默认配置（与后端一致）
  config: {
    minLength: 8,
    requireUppercase: true,
    requireLowercase: true,
    requireNumber: true,
    requireSpecial: true,
    specialChars: '!@#$%^&*(),.?":{}|<>'
  },

  /**
   * 验证密码强度
   * @param {string} password 待验证的密码
   * @returns {Object} 验证结果 {valid, score, level, messages}
   */
  validate(password) {
    const result = {
      valid: true,
      score: 0,
      level: 'weak',
      messages: [],
      checks: {
        length: false,
        uppercase: false,
        lowercase: false,
        number: false,
        special: false
      }
    };

    if (!password || typeof password !== 'string') {
      result.valid = false;
      result.messages.push('请输入密码');
      return result;
    }

    // 长度检查
    result.checks.length = password.length >= this.config.minLength;
    if (!result.checks.length) {
      result.valid = false;
      result.messages.push(`密码长度不能少于${this.config.minLength}位`);
    } else {
      result.score += 20;
    }

    // 大写字母检查
    result.checks.uppercase = /[A-Z]/.test(password);
    if (this.config.requireUppercase && !result.checks.uppercase) {
      result.valid = false;
      result.messages.push('密码必须包含大写字母');
    } else if (result.checks.uppercase) {
      result.score += 20;
    }

    // 小写字母检查
    result.checks.lowercase = /[a-z]/.test(password);
    if (this.config.requireLowercase && !result.checks.lowercase) {
      result.valid = false;
      result.messages.push('密码必须包含小写字母');
    } else if (result.checks.lowercase) {
      result.score += 20;
    }

    // 数字检查
    result.checks.number = /\d/.test(password);
    if (this.config.requireNumber && !result.checks.number) {
      result.valid = false;
      result.messages.push('密码必须包含数字');
    } else if (result.checks.number) {
      result.score += 20;
    }

    // 特殊字符检查
    const specialRegex = new RegExp(`[${this.config.specialChars.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}]`);
    result.checks.special = specialRegex.test(password);
    if (this.config.requireSpecial && !result.checks.special) {
      result.valid = false;
      result.messages.push(`密码必须包含特殊字符（${this.config.specialChars}）`);
    } else if (result.checks.special) {
      result.score += 20;
    }

    // 额外加分项
    // 长度超过12
    if (password.length >= 12) {
      result.score += 10;
    }
    // 长度超过16
    if (password.length >= 16) {
      result.score += 10;
    }

    // 计算强度等级
    if (result.score >= 80) {
      result.level = 'strong';
    } else if (result.score >= 60) {
      result.level = 'medium';
    } else {
      result.level = 'weak';
    }

    return result;
  },

  /**
   * 获取强度等级的显示文本
   * @param {string} level 强度等级
   * @returns {string} 显示文本
   */
  getLevelText(level) {
    const texts = {
      weak: '弱',
      medium: '中',
      strong: '强'
    };
    return texts[level] || '弱';
  },

  /**
   * 获取强度等级的颜色
   * @param {string} level 强度等级
   * @returns {string} 颜色值
   */
  getLevelColor(level) {
    const colors = {
      weak: '#ff4d4f',
      medium: '#faad14',
      strong: '#52c41a'
    };
    return colors[level] || '#ff4d4f';
  },

  /**
   * 获取检查项的提示文本
   * @param {string} check 检查项名称
   * @returns {string} 提示文本
   */
  getCheckText(check) {
    const texts = {
      length: `至少${this.config.minLength}位字符`,
      uppercase: '包含大写字母',
      lowercase: '包含小写字母',
      number: '包含数字',
      special: `包含特殊字符`
    };
    return texts[check] || '';
  },

  /**
   * 生成随机强密码
   * @param {number} length 密码长度
   * @returns {string} 生成的密码
   */
  generateStrongPassword(length = 12) {
    const uppercaseChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercaseChars = 'abcdefghijklmnopqrstuvwxyz';
    const numberChars = '0123456789';
    const specialChars = this.config.specialChars;

    const allChars = uppercaseChars + lowercaseChars + numberChars + specialChars;

    let password = '';

    // 确保每种字符至少有一个
    password += uppercaseChars[Math.floor(Math.random() * uppercaseChars.length)];
    password += lowercaseChars[Math.floor(Math.random() * lowercaseChars.length)];
    password += numberChars[Math.floor(Math.random() * numberChars.length)];
    password += specialChars[Math.floor(Math.random() * specialChars.length)];

    // 填充剩余长度
    for (let i = 4; i < length; i++) {
      password += allChars[Math.floor(Math.random() * allChars.length)];
    }

    // 打乱顺序
    return password.split('').sort(() => Math.random() - 0.5).join('');
  },

  /**
   * 检查密码是否为常见弱密码
   * @param {string} password 密码
   * @returns {boolean} 是否为弱密码
   */
  isCommonWeakPassword(password) {
    const weakPasswords = [
      'password', '123456', '12345678', 'qwerty', 'abc123',
      'monkey', 'master', 'dragon', '111111', 'baseball',
      'iloveyou', 'trustno1', 'sunshine', 'princess', 'welcome',
      'shadow', 'superman', 'michael', 'football', 'password1',
      'password123', 'admin', 'admin123', 'root', 'toor'
    ];

    const lowerPassword = password.toLowerCase();
    return weakPasswords.some(weak => 
      lowerPassword === weak || 
      lowerPassword.includes(weak) ||
      weak.includes(lowerPassword)
    );
  }
};

module.exports = PasswordValidator;