import React, { useState, useEffect } from 'react';
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  DollarOutlined,
  TeamOutlined,
  LineChartOutlined,
  TransactionOutlined,
  BellOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { Layout, Menu, Button, theme, App } from 'antd';
import type { MenuProps } from 'antd';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { notificationManager } from '../utils/notification';

const { Header, Sider, Content } = Layout;

const AdminLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { notification } = App.useApp();
  const {
    token: { colorBgContainer, borderRadiusLG },
  } = theme.useToken();

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
        { key: '/quotes/history', label: '历史行情' },
        { key: '/quotes/boards', label: '板块管理' },
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

  const handleLogout = () => {
    localStorage.removeItem('admin_token');
    navigate('/login', { replace: true });
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider 
        trigger={null} 
        collapsible 
        collapsed={collapsed}
        style={{
          background: '#2c3e50',
        }}
      >
        <div 
          style={{ 
            height: 64, 
            margin: 0, 
            background: '#2c3e50', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            color: 'white', 
            fontSize: collapsed ? 14 : 18,
            fontWeight: 'bold',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            padding: '0 16px',
          }}
        >
          {collapsed ? 'OTC' : '期权后台管理系统'}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          defaultSelectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{
            background: '#2c3e50',
            borderRight: 0,
          }}
        />
      </Sider>
      <Layout>
        <Header style={{ padding: 0, background: colorBgContainer, display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 24 }}>
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
            style={{
              fontSize: '16px',
              width: 64,
              height: 64,
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span style={{ marginRight: 16 }}>管理员 (Admin)</span>
            <Button type="link" onClick={handleLogout}>退出登录</Button>
          </div>
        </Header>
        <Content
          style={{
            margin: '24px 16px',
            padding: 24,
            minHeight: 280,
            background: colorBgContainer,
            borderRadius: borderRadiusLG,
            overflow: 'auto'
          }}
        >
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
};

export default AdminLayout;
