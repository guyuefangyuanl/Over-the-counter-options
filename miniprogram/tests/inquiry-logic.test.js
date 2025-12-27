const logic = require('../utils/inquiry-logic.js');

describe('validateNewGroupName', () => {
  const allGroups = [
    { id: 'all', name: '全部' },
    { id: 'holding', name: '我的持仓' },
    { id: 'g1', name: '核心资产' },
  ];

  test('empty name returns error', () => {
    const { error, canConfirm } = logic.validateNewGroupName('', allGroups);
    expect(error).toBe('请输入分组名');
    expect(canConfirm).toBe(false);
  });

  test('too long name returns error', () => {
    const name = 'a'.repeat(21);
    const { error, canConfirm } = logic.validateNewGroupName(name, allGroups);
    expect(error).toBe('分组名最多20个字');
    expect(canConfirm).toBe(false);
  });

  test('duplicate name returns error', () => {
    const { error, canConfirm } = logic.validateNewGroupName('核心资产', allGroups);
    expect(error).toBe('已存在同名分组');
    expect(canConfirm).toBe(false);
  });

  test('valid name passes', () => {
    const { error, canConfirm } = logic.validateNewGroupName('新分组', allGroups);
    expect(error).toBe('');
    expect(canConfirm).toBe(true);
  });
});

describe('computeGroupCountsFromFavorites', () => {
  test('counts with empty favorites', () => {
    const counts = logic.computeGroupCountsFromFavorites({});
    expect(counts.all).toBe(0);
    expect(counts.holding).toBe(0);
  });

  test('counts with mixed groups', () => {
    const favoritesById = {
      1: { groupId: 'g1' },
      2: { groupId: 'holding' },
      3: { groupId: 'g1' },
      4: {}, // default to 'all'
    };
    const counts = logic.computeGroupCountsFromFavorites(favoritesById);
    expect(counts.all).toBe(4);
    expect(counts.g1).toBe(2);
    expect(counts.holding).toBe(1);
  });
});

describe('validateRenameGroupName', () => {
  const allGroups = [
    { id: 'g1', name: '核心资产' },
    { id: 'g2', name: '科技龙头' },
  ];

  test('empty name returns error', () => {
    const { error, canConfirm } = logic.validateRenameGroupName('', 'g1', allGroups);
    expect(error).toBe('请输入分组名');
    expect(canConfirm).toBe(false);
  });

  test('too long name returns error', () => {
    const name = 'a'.repeat(21);
    const { error, canConfirm } = logic.validateRenameGroupName(name, 'g1', allGroups);
    expect(error).toBe('分组名最多20个字');
    expect(canConfirm).toBe(false);
  });

  test('duplicate name with different group returns error', () => {
    const { error, canConfirm } = logic.validateRenameGroupName('科技龙头', 'g1', allGroups);
    expect(error).toBe('已存在同名分组');
    expect(canConfirm).toBe(false);
  });

  test('same name as current group passes', () => {
    const { error, canConfirm } = logic.validateRenameGroupName('核心资产', 'g1', allGroups);
    expect(error).toBe('');
    expect(canConfirm).toBe(true);
  });

  test('valid new name passes', () => {
    const { error, canConfirm } = logic.validateRenameGroupName('新名称', 'g1', allGroups);
    expect(error).toBe('');
    expect(canConfirm).toBe(true);
  });
});

describe('getAvailableTargetGroups', () => {
  const systemGroups = [
    { id: 'all', name: '全部' },
    { id: 'holding', name: '我的持仓' },
  ];
  const customGroups = [
    { id: 'g1', name: '核心资产' },
    { id: 'g2', name: '科技龙头' },
  ];

  test('excludes current group and all', () => {
    const available = logic.getAvailableTargetGroups('g1', systemGroups, customGroups);
    expect(available.length).toBe(2);
    expect(available.map(g => g.id)).toEqual(['holding', 'g2']);
  });

  test('returns all available groups when current is all', () => {
    const available = logic.getAvailableTargetGroups('all', systemGroups, customGroups);
    expect(available.length).toBe(3);
    expect(available.map(g => g.id)).toEqual(['holding', 'g1', 'g2']);
  });
});

describe('computeMigrationCount', () => {
  test('counts items in specific group', () => {
    const favoritesById = {
      1: { groupId: 'g1' },
      2: { groupId: 'g2' },
      3: { groupId: 'g1' },
      4: { groupId: 'holding' },
    };
    const count = logic.computeMigrationCount('g1', favoritesById);
    expect(count).toBe(2);
  });

  test('returns 0 for empty favorites', () => {
    const count = logic.computeMigrationCount('g1', {});
    expect(count).toBe(0);
  });

  test('returns 0 for non-existent group', () => {
    const favoritesById = {
      1: { groupId: 'g1' },
    };
    const count = logic.computeMigrationCount('g2', favoritesById);
    expect(count).toBe(0);
  });
});

describe('migrateGroupItems', () => {
  test('migrates items from one group to another', () => {
    const favoritesById = {
      1: { groupId: 'g1' },
      2: { groupId: 'g2' },
      3: { groupId: 'g1' },
      4: { groupId: 'holding' },
    };
    const result = logic.migrateGroupItems('g1', 'g2', favoritesById);

    expect(result[1].groupId).toBe('g2');
    expect(result[2].groupId).toBe('g2');
    expect(result[3].groupId).toBe('g2');
    expect(result[4].groupId).toBe('holding'); // 不变
  });

  test('handles empty favorites', () => {
    const result = logic.migrateGroupItems('g1', 'g2', {});
    expect(result).toEqual({});
  });

  test('preserves other properties during migration', () => {
    const favoritesById = {
      1: { groupId: 'g1', extra: 'data' },
    };
    const result = logic.migrateGroupItems('g1', 'g2', favoritesById);

    expect(result[1].groupId).toBe('g2');
    expect(result[1].extra).toBe('data');
  });
});

describe('isProtectedGroup', () => {
  test('returns true for protected names', () => {
    expect(logic.isProtectedGroup('全部')).toBe(true);
    expect(logic.isProtectedGroup('持仓')).toBe(true);
    expect(logic.isProtectedGroup('沪深')).toBe(true);
    expect(logic.isProtectedGroup('指数')).toBe(true);
  });

  test('returns true for protected ids', () => {
    expect(logic.isProtectedGroup({ id: 'all', name: '随便' })).toBe(true);
    expect(logic.isProtectedGroup({ id: 'holding', name: '我的持仓' })).toBe(true);
  });

  test('returns false for normal custom group', () => {
    expect(logic.isProtectedGroup({ id: 'g1', name: '核心资产' })).toBe(false);
  });
});

describe('extractGroupMemberCodes', () => {
  test('returns empty array for empty group', () => {
    expect(logic.extractGroupMemberCodes(null)).toEqual([]);
    expect(logic.extractGroupMemberCodes({})).toEqual([]);
    expect(logic.extractGroupMemberCodes({ members: [] })).toEqual([]);
  });

  test('extracts stock codes from members', () => {
    const group = {
      members: [
        { stock_code: '300750.SZ' },
        { stockCode: '000001' },
        { stock_code: '  603259.SH  ' },
        {},
        null
      ]
    };
    expect(logic.extractGroupMemberCodes(group)).toEqual(['300750.SZ', '000001', '603259.SH']);
  });
});

describe('removeFavoritesByCodes', () => {
  test('returns copy when codes empty', () => {
    const favorites = [{ code: '300750.SZ' }];
    const res = logic.removeFavoritesByCodes(favorites, []);
    expect(res).toEqual(favorites);
    expect(res).not.toBe(favorites);
  });

  test('removes matching codes including suffix variations', () => {
    const favorites = [
      { code: '300750.SZ' },
      { code: '000001' },
      { code: '603259.SH' },
      { code: 'AAPL' }
    ];
    const res = logic.removeFavoritesByCodes(favorites, ['300750', '603259.SH']);
    expect(res.map(i => i.code)).toEqual(['000001', 'AAPL']);
  });

  test('handles non-array inputs safely', () => {
    expect(logic.removeFavoritesByCodes(null, ['1'])).toEqual([]);
    expect(logic.removeFavoritesByCodes([{ code: '1' }], null)).toEqual([{ code: '1' }]);
  });
});

