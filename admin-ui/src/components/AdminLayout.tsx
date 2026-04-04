import React, { useState, useEffect, useMemo } from 'react';
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  DollarOutlined,
  TeamOutlined,
  LineChartOutlined,
  TransactionOutlined,
  BellOutlined,
  SettingOutlined,
  UserOutlined,
  LogoutOutlined,
  KeyOutlined,
  HomeOutlined,
} from '@ant-design/icons';
import { Layout, Menu, Dropdown, Breadcrumb, App } from 'antd';
import type { MenuProps, BreadcrumbProps } from 'antd';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { notificationManager } from '../utils/notification';

const { Header, Sider, Content } = Layout;

// 侧边栏宽度配置
const SIDEBAR_WIDTH = 166;
const SIDEBAR_COLLAPSED_WIDTH = 60;

// 菜单配置
const menuItems: MenuProps['items'] = [
  {
    key: 'fee',
    icon: <DollarOutlined />,
    label: '费用管理',
    children: [
      { key: '/fee/list', label: '费用列表' },
      { key: '/fee/statistics', label: '费用统计' },
    ],
  },
  {
    key: 'customer',
    icon: <TeamOutlined />,
    label: '客户管理',
    children: [
      { key: '/customer/list', label: '客户列表' },
      { key: '/customer/groups', label: '客户分组' },
    ],
  },
  {
    key: 'quotes',
    icon: <LineChartOutlined />,
    label: '行情管理',
    children: [
      { key: '/quotes', label: '实时行情' },
    ],
  },
  {
    key: 'trade',
    icon: <TransactionOutlined />,
    label: '交易管理',
    children: [
      { key: '/trade/orders', label: '订单管理' },
      { key: '/trade/inquiries', label: '询价管理' },
      { key: '/trade/positions', label: '持仓管理' },
    ],
  },
  {
    key: 'message',
    icon: <BellOutlined />,
    label: '消息管理',
    children: [
      { key: '/message/list', label: '消息列表' },
      { key: '/message/templates', label: '消息模板' },
    ],
  },
  {
    key: 'config',
    icon: <SettingOutlined />,
    label: '配置管理',
    children: [
      { key: '/config/system', label: '系统配置' },
      { key: '/config/users', label: '用户管理' },
    ],
  },
];

// 路由到菜单标题的映射
const routeNameMap: Record<string, string> = {
  '/': '首页',
  '/fee/list': '费用列表',
  '/fee/statistics': '费用统计',
  '/customer/list': '客户列表',
  '/customer/groups': '客户分组',
  '/quotes': '实时行情',
  '/trade/orders': '订单管理',
  '/trade/inquiries': '询价管理',
  '/trade/positions': '持仓管理',
  '/message/list': '消息列表',
  '/message/templates': '消息模板',
  '/config/system': '系统配置',
  '/config/users': '用户管理',
  // 旧路由兼容
  '/inquiries': '询价管理',
  '/orders': '订单管理',
  '/users': '用户管理',
  '/settings': '系统设置',
};

// 父菜单映射
const parentMenuMap: Record<string, string> = {
  '/fee/list': '费用管理',
  '/fee/statistics': '费用管理',
  '/customer/list': '客户管理',
  '/customer/groups': '客户管理',
  '/quotes': '行情管理',
  '/trade/orders': '交易管理',
  '/trade/inquiries': '交易管理',
  '/trade/positions': '交易管理',
  '/message/list': '消息管理',
  '/message/templates': '消息管理',
  '/config/system': '配置管理',
  '/config/users': '配置管理',
};

const AdminLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { notification } = App.useApp();

  // 订阅通知
  useEffect(() => {
    const unsubscribe = notificationManager.subscribe((options) => {
      notification[options.type || 'info']({
        message: options.title,
        description: options.message,
        duration: options.duration ? options.duration / 1000 : 4.5,
        placement: 'topRight',
        onClick: options.onClick,
      });
    });

    return () => unsubscribe();
  }, [notification]);

  // 退出登录
  const handleLogout = () => {
    localStorage.removeItem('admin_token');
    navigate('/login', { replace: true });
  };

  // 用户下拉菜单
  const userMenuItems: MenuProps['items'] = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: '个人信息',
    },
    {
      key: 'password',
      icon: <KeyOutlined />,
      label: '修改密码',
    },
    {
      type: 'divider',
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      danger: true,
    },
  ];

  const handleUserMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (key === 'logout') {
      handleLogout();
    }
  };

  // 生成面包屑
  const breadcrumbItems: BreadcrumbProps['items'] = useMemo(() => {
    const items: BreadcrumbProps['items'] = [
      {
        title: (
          <span onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
            <HomeOutlined style={{ marginRight: 4 }} />
            首页
          </span>
        ),
      },
    ];

    const currentPath = location.pathname;
    const parentName = parentMenuMap[currentPath];
    const currentName = routeNameMap[currentPath];

    if (parentName && currentPath !== '/') {
      items.push({
        title: parentName,
      });
    }

    if (currentName && currentPath !== '/') {
      items.push({
        title: currentName,
      });
    }

    return items;
  }, [location.pathname, navigate]);

  // 获取当前选中的菜单项
  const selectedKeys = useMemo(() => {
    const path = location.pathname;
    return [path];
  }, [location.pathname]);

  // 获取当前展开的子菜单
  const defaultOpenKeys = useMemo(() => {
    const path = location.pathname;
    const parent = parentMenuMap[path];
    if (parent) {
      // 找到父菜单的 key
      const parentKey = menuItems.find(item => {
        if (item && 'label' in item) {
          return item.label === parent;
        }
        return false;
      });
      return parentKey && 'key' in parentKey ? [parentKey.key as string] : [];
    }
    return [];
  }, [location.pathname]);

  return (
    <Layout className="admin-layout" style={{ minHeight: '100vh' }}>
      {/* 侧边栏 */}
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        width={SIDEBAR_WIDTH}
        collapsedWidth={SIDEBAR_COLLAPSED_WIDTH}
        className="admin-layout-sider"
      >
        {/* Logo 区域 */}
        <div className={`admin-menu-header ${collapsed ? 'admin-menu-header-collapsed' : ''}`}>
          {collapsed ? 'OTC' : '期权后台管理系统'}
        </div>

        {/* 菜单 */}
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={selectedKeys}
          defaultOpenKeys={defaultOpenKeys}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>

      <Layout>
        {/* 头部 */}
        <Header className="admin-layout-header">
          <div className="admin-layout-header-left">
            {/* 折叠按钮 */}
            <div
              className="admin-collapse-btn"
              onClick={() => setCollapsed(!collapsed)}
            >
              {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            </div>

            {/* 面包屑导航 */}
            <Breadcrumb className="admin-breadcrumb" items={breadcrumbItems} />
          </div>

          <div className="admin-layout-header-right">
            {/* 用户信息 */}
            <Dropdown
              menu={{ items: userMenuItems, onClick: handleUserMenuClick }}
              placement="bottomRight"
              trigger={['click']}
            >
              <div className="admin-user-info">
                <div className="admin-user-avatar">
                  <UserOutlined />
                </div>
                <span className="admin-user-name">Admin</span>
              </div>
            </Dropdown>
          </div>
        </Header>

        {/* 内容区域 */}
        <Content className="admin-layout-content">
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
};

export default AdminLayout;