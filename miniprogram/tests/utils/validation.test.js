/**
 * 询价验证工具测试
 *
 * 测试覆盖:
 * - 手机号验证
 * - 邮箱验证
 * - 名义本金验证
 * - 行权价验证
 * - 表单整体验证
 */

const utils = require('../../pages/inquiry/inquiry-utils.js');

// 模拟常量
jest.mock('../../pages/inquiry/inquiry-constants.js', () => ({
  VALIDATION_RULES: {
    phone: /^1[3-9]\d{9}$/,
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    notionalMin: 100,
    notionalMax: 100000,
    strikeMin: 50,
    strikeMax: 200,
    groupNameMin: 1,
    groupNameMax: 20
  }
}));

describe('Validation Utils', () => {
  describe('validatePhone', () => {
    test('validates correct phone number', () => {
      const result = utils.validatePhone('13800138000');
      expect(result.valid).toBe(true);
      expect(result.error).toBe('');
    });

    test('rejects empty phone', () => {
      const result = utils.validatePhone('');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('请输入手机号');
    });

    test('rejects invalid phone format', () => {
      const invalidPhones = [
        '12800138000',  // 不以1开头
        '1380013800',   // 少一位
        '138001380001', // 多一位
        'abcdefghijk',  // 字母
        '138 0013 8000' // 带空格
      ];

      invalidPhones.forEach(phone => {
        const result = utils.validatePhone(phone);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('格式不正确');
      });
    });

    test('handles whitespace-only input', () => {
      const result = utils.validatePhone('   ');
      expect(result.valid).toBe(false);
    });

    test('accepts all valid prefixes', () => {
      const validPhones = ['13000000000', '15000000000', '18000000000', '19900000000'];
      validPhones.forEach(phone => {
        const result = utils.validatePhone(phone);
        expect(result.valid).toBe(true);
      });
    });
  });

  describe('validateEmail', () => {
    test('validates correct email', () => {
      const validEmails = [
        'test@example.com',
        'user.name@domain.co.jp',
        'test123@test.org'
      ];

      validEmails.forEach(email => {
        const result = utils.validateEmail(email);
        expect(result.valid).toBe(true);
      });
    });

    test('allows empty email (optional field)', () => {
      const result = utils.validateEmail('');
      expect(result.valid).toBe(true);
    });

    test('rejects invalid email format', () => {
      const invalidEmails = [
        'invalid',
        'invalid@',
        '@domain.com',
        'test@.com',
        'test@domain',
        'test domain@test.com'
      ];

      invalidEmails.forEach(email => {
        const result = utils.validateEmail(email);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('格式不正确');
      });
    });
  });

  describe('validateNotionalAmount', () => {
    test('validates correct amount', () => {
      const result = utils.validateNotionalAmount(1000);
      expect(result.valid).toBe(true);
    });

    test('rejects empty amount', () => {
      const result = utils.validateNotionalAmount('');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('请输入名义本金');
    });

    test('rejects amount below minimum', () => {
      const result = utils.validateNotionalAmount(50);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('不能小于');
    });

    test('rejects amount above maximum', () => {
      const result = utils.validateNotionalAmount(200000);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('不能超过');
    });

    test('rejects negative amount', () => {
      const result = utils.validateNotionalAmount(-100);
      expect(result.valid).toBe(false);
    });

    test('accepts boundary values', () => {
      expect(utils.validateNotionalAmount(100).valid).toBe(true);
      expect(utils.validateNotionalAmount(100000).valid).toBe(true);
    });

    test('handles string input', () => {
      const result = utils.validateNotionalAmount('500');
      expect(result.valid).toBe(true);
    });

    test('rejects non-numeric input', () => {
      const result = utils.validateNotionalAmount('abc');
      expect(result.valid).toBe(false);
    });
  });

  describe('validateStrikePrice', () => {
    test('validates correct strike price', () => {
      const result = utils.validateStrikePrice(100);
      expect(result.valid).toBe(true);
    });

    test('rejects empty strike price', () => {
      const result = utils.validateStrikePrice('');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('请输入行权价');
    });

    test('rejects strike price below range', () => {
      const result = utils.validateStrikePrice(30);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('不能低于');
    });

    test('rejects strike price above range', () => {
      const result = utils.validateStrikePrice(250);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('不能高于');
    });

    test('accepts boundary values', () => {
      expect(utils.validateStrikePrice(50).valid).toBe(true);
      expect(utils.validateStrikePrice(200).valid).toBe(true);
    });

    test('handles decimal values', () => {
      const result = utils.validateStrikePrice(105.5);
      expect(result.valid).toBe(true);
    });
  });

  describe('validateGroupName', () => {
    test('validates correct name', () => {
      const result = utils.validateGroupName('测试分组');
      expect(result.valid).toBe(true);
    });

    test('rejects empty name', () => {
      const result = utils.validateGroupName('');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('不能为空');
    });

    test('rejects too long name', () => {
      const longName = 'a'.repeat(21);
      const result = utils.validateGroupName(longName);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('不能超过');
    });

    test('accepts max length', () => {
      const maxName = 'a'.repeat(20);
      const result = utils.validateGroupName(maxName);
      expect(result.valid).toBe(true);
    });
  });

  describe('validateInquiryForm', () => {
    test('validates complete form', () => {
      const form = {
        contactName: '测试用户',
        contactPhone: '13800138000',
        contactEmail: 'test@example.com',
        notionalAmount: 1000,
        strikePrice: 100
      };

      const result = utils.validateInquiryForm(form);
      expect(result.valid).toBe(true);
      expect(Object.keys(result.errors).length).toBe(0);
    });

    test('returns all errors for empty form', () => {
      const form = {
        contactName: '',
        contactPhone: '',
        notionalAmount: '',
        strikePrice: ''
      };

      const result = utils.validateInquiryForm(form);
      expect(result.valid).toBe(false);
      expect(result.errors.contactName).toBeDefined();
      expect(result.errors.contactPhone).toBeDefined();
      expect(result.errors.notionalAmount).toBeDefined();
    });

    test('validates optional email', () => {
      const form = {
        contactName: '测试用户',
        contactPhone: '13800138000',
        contactEmail: '',  // 可选
        notionalAmount: 1000,
        strikePrice: 100
      };

      const result = utils.validateInquiryForm(form);
      expect(result.valid).toBe(true);
    });

    test('catches multiple validation errors', () => {
      const form = {
        contactName: '',
        contactPhone: 'invalid',
        contactEmail: 'invalid',
        notionalAmount: -100,
        strikePrice: 500
      };

      const result = utils.validateInquiryForm(form);
      expect(result.valid).toBe(false);
      expect(Object.keys(result.errors).length).toBeGreaterThan(1);
    });
  });
});

describe('Format Utils', () => {
  describe('formatAmount', () => {
    test('formats valid number', () => {
      expect(utils.formatAmount(1234.567)).toBe('1234.57');
      expect(utils.formatAmount(100)).toBe('100.00');
    });

    test('handles null/undefined', () => {
      expect(utils.formatAmount(null)).toBe('--');
      expect(utils.formatAmount(undefined)).toBe('--');
    });

    test('handles NaN', () => {
      expect(utils.formatAmount(NaN)).toBe('--');
    });

    test('respects decimal places', () => {
      expect(utils.formatAmount(123.456, 0)).toBe('123');
      expect(utils.formatAmount(123.456, 3)).toBe('123.456');
    });
  });

  describe('formatPercent', () => {
    test('formats positive percentage', () => {
      const result = utils.formatPercent(0.05);
      expect(result).toContain('+');
      expect(result).toContain('5');
    });

    test('formats negative percentage', () => {
      const result = utils.formatPercent(-0.03);
      expect(result).toContain('-');
      expect(result).toContain('3');
    });

    test('handles zero', () => {
      const result = utils.formatPercent(0);
      expect(result).toContain('0');
    });

    test('handles null/undefined', () => {
      expect(utils.formatPercent(null)).toBe('--');
      expect(utils.formatPercent(undefined)).toBe('--');
    });
  });
});

describe('Utility Functions', () => {
  describe('debounce', () => {
    jest.useFakeTimers();

    test('debounces function calls', () => {
      const fn = jest.fn();
      const debouncedFn = utils.debounce(fn, 100);

      debouncedFn();
      debouncedFn();
      debouncedFn();

      expect(fn).not.toHaveBeenCalled();

      jest.advanceTimersByTime(100);

      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('throttle', () => {
    jest.useFakeTimers();

    test('throttles function calls', () => {
      const fn = jest.fn();
      const throttledFn = utils.throttle(fn, 100);

      throttledFn();
      throttledFn();
      throttledFn();

      expect(fn).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(100);

      throttledFn();
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('deepClone', () => {
    test('clones simple object', () => {
      const obj = { a: 1, b: 'test' };
      const clone = utils.deepClone(obj);

      expect(clone).toEqual(obj);
      expect(clone).not.toBe(obj);
    });

    test('clones nested object', () => {
      const obj = { a: { b: { c: 1 } } };
      const clone = utils.deepClone(obj);

      expect(clone.a.b.c).toBe(1);
      clone.a.b.c = 2;
      expect(obj.a.b.c).toBe(1);
    });

    test('handles null', () => {
      expect(utils.deepClone(null)).toBe(null);
    });

    test('handles primitives', () => {
      expect(utils.deepClone(123)).toBe(123);
      expect(utils.deepClone('test')).toBe('test');
    });
  });

  describe('generateId', () => {
    test('generates unique IDs', () => {
      const id1 = utils.generateId();
      const id2 = utils.generateId();

      expect(id1).not.toBe(id2);
    });

    test('generates IDs with prefix', () => {
      const id = utils.generateId('test');
      expect(id).toContain('test');
    });
  });

  describe('isEmpty', () => {
    test('checks empty object', () => {
      expect(utils.isEmpty({})).toBe(true);
      expect(utils.isEmpty({ a: 1 })).toBe(false);
    });

    test('checks empty array', () => {
      expect(utils.isEmpty([])).toBe(true);
      expect(utils.isEmpty([1])).toBe(false);
    });

    test('checks null/undefined', () => {
      expect(utils.isEmpty(null)).toBe(true);
      expect(utils.isEmpty(undefined)).toBe(true);
    });
  });
});