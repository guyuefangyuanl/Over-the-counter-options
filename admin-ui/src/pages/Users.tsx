import React, { useState, useEffect, useCallback } from 'react';
import { Card, Table, Button, Tag, App, Space, Popconfirm, Input, Modal, Form, Select, Tabs, Typography, Avatar, Tooltip, Badge } from 'antd';
import { ReloadOutlined, PlusOutlined, DeleteOutlined, EditOutlined, UserOutlined, DollarOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import api, { getApiErrorMessage, type ApiResponse } from '../utils/api';
import PageState from '../components/PageState';

const { Title, Text } = Typography;

// 管理员用户类型
interface AdminUser {
  username: string;
  role: string;
  created_at?: string;
  updated_at?: string;
}

// 小程序用户类型
interface WxUser {
  _id: string;
  openid: string;
  nickname: string;
  phone: string;
  avatar: string;
  balance: number;
  status: string;
  remark: string;
  created_at?: string;
  last_login?: string;
}

interface PaginatedPayload<T> {
  items: T[];
  pagination: {
    page: number;
    per_page: number;
    total: number;
  };
}

const Users: React.FC = () => {
  const { message } = App.useApp();
  const [activeTab, setActiveTab] = useState('admin');
  
  // 管理员用户状态
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [adminError, setAdminError] = useState<string | null>(null);
  
  // 小程序用户状态
  const [wxLoading, setWxLoading] = useState(false);
  const [wxUsers, setWxUsers] = useState<WxUser[]>([]);
  const [wxPagination, setWxPagination] = useState({ current: 1, pageSize: 10, total: 0 });
  const [wxError, setWxError] = useState<string | null>(null);
  const [wxKeyword, setWxKeyword] = useState('');
  
  // 模态框
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [adminModalLoading, setAdminModalLoading] = useState(false);
  const [currentAdmin, setCurrentAdmin] = useState<AdminUser | null>(null);
  const [adminForm] = Form.useForm();
  
  const [isBalanceModalOpen, setIsBalanceModalOpen] = useState(false);
  const [balanceModalLoading, setBalanceModalLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<WxUser | null>(null);
  const [balanceForm] = Form.useForm();

  // 获取管理员用户列表
  const fetchAdminUsers = useCallback(async () => {
    setAdminLoading(true);
    setAdminError(null);
    try {
      const res = await api.get<ApiResponse<AdminUser[]>>('/auth/users');
      if (res.success && Array.isArray(res.data)) {
        setAdminUsers(res.data);
      }
    } catch (err) {
      const msg = getApiErrorMessage(err, '获取管理员列表失败');
      setAdminError(msg);
      message.error(msg);
    } finally {
      setAdminLoading(false);
    }
  }, [message]);

  // 获取小程序用户列表
  const fetchWxUsers = useCallback(async (page = 1, pageSize = 10, keyword = '') => {
    setWxLoading(true);
    setWxError(null);
    try {
      const res = await api.get<ApiResponse<PaginatedPayload<WxUser>>>('/auth/wx-users', {
        params: { page, pageSize, keyword: keyword || undefined },
      });
      if (res.success && res.data?.pagination && Array.isArray(res.data.items)) {
        setWxUsers(res.data.items);
        setWxPagination({
          current: res.data.pagination.page,
          pageSize: res.data.pagination.per_page,
          total: res.data.pagination.total,
        });
      }
    } catch (err) {
      const msg = getApiErrorMessage(err, '获取用户列表失败');
      setWxError(msg);
      message.error(msg);
    } finally {
      setWxLoading(false);
    }
  }, [message]);

  // 初始加载
  useEffect(() => {
    void fetchAdminUsers();
  }, [fetchAdminUsers]);

  useEffect(() => {
    if (activeTab === 'wx') {
      void fetchWxUsers(1, wxPagination.pageSize, wxKeyword);
    }
  }, [activeTab, fetchWxUsers, wxKeyword]);

  // 管理员用户操作
  const handleDeleteAdmin = async (username: string) => {
    try {
      await api.delete(`/auth/users/${username}`);
      message.success('删除成功');
      void fetchAdminUsers();
    } catch (err) {
      message.error(getApiErrorMessage(err, '删除失败'));
    }
  };

  const openAdminModal = (record?: AdminUser) => {
    setCurrentAdmin(record || null);
    if (record) {
      adminForm.setFieldsValue(record);
    } else {
      adminForm.resetFields();
      adminForm.setFieldsValue({ role: 'viewer' });
    }
    setIsAdminModalOpen(true);
  };

  const handleAdminModalOk = async () => {
    try {
      const values = await adminForm.validateFields();
      setAdminModalLoading(true);
      
      await api.post('/auth/users', {
        username: values.username,
        password: values.password,
        role: values.role,
      });
      
      message.success(currentAdmin ? '更新成功' : '创建成功');
      setIsAdminModalOpen(false);
      void fetchAdminUsers();
    } catch (err) {
      if (err instanceof Error && err.name === 'ValidationError') {
        return;
      }
      message.error(getApiErrorMessage(err, '操作失败'));
    } finally {
      setAdminModalLoading(false);
    }
  };

  // 小程序用户操作
  const handleWxSearch = (value: string) => {
    setWxKeyword(value);
    void fetchWxUsers(1, wxPagination.pageSize, value);
  };

  const openBalanceModal = (record: WxUser) => {
    setCurrentUser(record);
    balanceForm.resetFields();
    balanceForm.setFieldsValue({ amount: 0, remark: '' });
    setIsBalanceModalOpen(true);
  };

  const handleBalanceModalOk = async () => {
    try {
      const values = await balanceForm.validateFields();
      setBalanceModalLoading(true);
      
      const res = await api.post<ApiResponse<{ balance: number }>>(`/auth/wx-users/${currentUser?.openid}/balance`, {
        amount: values.amount,
        remark: values.remark || '管理员调整',
      });
      
      if (res.success) {
        message.success(`余额调整成功，当前余额: ¥${res.data?.balance.toFixed(2)}`);
        setIsBalanceModalOpen(false);
        void fetchWxUsers(wxPagination.current, wxPagination.pageSize, wxKeyword);
      }
    } catch (err) {
      message.error(getApiErrorMessage(err, '调整失败'));
    } finally {
      setBalanceModalLoading(false);
    }
  };

  // 管理员用户表格列
  const adminColumns: ColumnsType<AdminUser> = [
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
      render: (val) => <Text strong>{val}</Text>,
    },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      render: (role) => {
        const colorMap: Record<string, string> = {
          admin: 'red',
          editor: 'blue',
          viewer: 'green',
        };
        const labelMap: Record<string, string> = {
          admin: '管理员',
          editor: '编辑',
          viewer: '查看者',
        };
        return <Tag color={colorMap[role] || 'default'}>{labelMap[role] || role}</Tag>;
      },
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (val) => val ? new Date(val).toLocaleString() : '-',
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openAdminModal(record)}>
            编辑
          </Button>
          <Popconfirm title="确定删除吗？" onConfirm={() => handleDeleteAdmin(record.username)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // 小程序用户表格列
  const wxColumns: ColumnsType<WxUser> = [
    {
      title: '用户',
      key: 'user',
      render: (_, record) => (
        <Space>
          <Avatar src={record.avatar} icon={<UserOutlined />} size="small" />
          <div>
            <Text strong>{record.nickname || '微信用户'}</Text>
            <br />
            <Text type="secondary" style={{ fontSize: 12 }}>{record.openid?.slice(0, 16)}...</Text>
          </div>
        </Space>
      ),
    },
    {
      title: '手机号',
      dataIndex: 'phone',
      key: 'phone',
      render: (val) => val || '-',
    },
    {
      title: '余额',
      dataIndex: 'balance',
      key: 'balance',
      render: (val) => (
        <Text type={val > 0 ? 'success' : val < 0 ? 'danger' : undefined}>
          ¥{Number(val || 0).toFixed(2)}
        </Text>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status) => (
        <Badge status={status === 'active' ? 'success' : 'error'} text={status === 'active' ? '正常' : '停用'} />
      ),
    },
    {
      title: '注册时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (val) => val ? new Date(val).toLocaleDateString() : '-',
    },
    {
      title: '最近登录',
      dataIndex: 'last_login',
      key: 'last_login',
      render: (val) => val ? new Date(val).toLocaleString() : '-',
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <Space>
          <Tooltip title="调整余额">
            <Button type="link" size="small" icon={<DollarOutlined />} onClick={() => openBalanceModal(record)}>
              调整余额
            </Button>
          </Tooltip>
        </Space>
      ),
    },
  ];

  const tabItems = [
    {
      key: 'admin',
      label: '管理员用户',
      children: (
        <PageState
          loading={adminLoading}
          error={adminError}
          empty={!adminLoading && !adminError && adminUsers.length === 0}
          onRetry={fetchAdminUsers}
        >
          <Table
            columns={adminColumns}
            dataSource={adminUsers}
            rowKey="username"
            pagination={false}
          />
        </PageState>
      ),
    },
    {
      key: 'wx',
      label: '小程序用户',
      children: (
        <>
          <div style={{ marginBottom: 16 }}>
            <Input.Search
              placeholder="搜索昵称或手机号"
              onSearch={handleWxSearch}
              style={{ width: 250 }}
              allowClear
            />
          </div>
          <PageState
            loading={wxLoading}
            error={wxError}
            empty={!wxLoading && !wxError && wxUsers.length === 0}
            onRetry={() => fetchWxUsers(wxPagination.current, wxPagination.pageSize, wxKeyword)}
          >
            <Table
              columns={wxColumns}
              dataSource={wxUsers}
              rowKey="_id"
              pagination={{
                current: wxPagination.current,
                pageSize: wxPagination.pageSize,
                total: wxPagination.total,
                showSizeChanger: true,
                showQuickJumper: true,
                showTotal: (total) => `共 ${total} 条`,
                onChange: (page, pageSize) => {
                  setWxPagination((prev) => ({ ...prev, current: page, pageSize }));
                  void fetchWxUsers(page, pageSize, wxKeyword);
                },
              }}
            />
          </PageState>
        </>
      ),
    },
  ];

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>用户管理</Title>
        {activeTab === 'admin' && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openAdminModal()}>
            新增管理员
          </Button>
        )}
        {activeTab === 'wx' && (
          <Button icon={<ReloadOutlined />} onClick={() => fetchWxUsers(wxPagination.current, wxPagination.pageSize, wxKeyword)}>
            刷新
          </Button>
        )}
      </div>

      <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />

      {/* 管理员用户模态框 */}
      <Modal
        title={currentAdmin ? '编辑管理员' : '新增管理员'}
        open={isAdminModalOpen}
        onOk={handleAdminModalOk}
        onCancel={() => setIsAdminModalOpen(false)}
        confirmLoading={adminModalLoading}
      >
        <Form form={adminForm} layout="vertical">
          <Form.Item
            name="username"
            label="用户名"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input placeholder="请输入用户名" disabled={!!currentAdmin} />
          </Form.Item>
          <Form.Item
            name="password"
            label="密码"
            rules={[{ required: !currentAdmin, message: '请输入密码' }]}
            extra={currentAdmin ? '留空则不修改密码' : undefined}
          >
            <Input.Password placeholder="请输入密码" />
          </Form.Item>
          <Form.Item
            name="role"
            label="角色"
            rules={[{ required: true, message: '请选择角色' }]}
          >
            <Select>
              <Select.Option value="viewer">查看者</Select.Option>
              <Select.Option value="editor">编辑</Select.Option>
              <Select.Option value="admin">管理员</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      {/* 余额调整模态框 */}
      <Modal
        title={`调整余额 - ${currentUser?.nickname || '用户'}`}
        open={isBalanceModalOpen}
        onOk={handleBalanceModalOk}
        onCancel={() => setIsBalanceModalOpen(false)}
        confirmLoading={balanceModalLoading}
      >
        <div style={{ marginBottom: 16 }}>
          <Text>当前余额: </Text>
          <Text strong type={Number(currentUser?.balance) > 0 ? 'success' : undefined}>
            ¥{Number(currentUser?.balance || 0).toFixed(2)}
          </Text>
        </div>
        <Form form={balanceForm} layout="vertical">
          <Form.Item
            name="amount"
            label="调整金额"
            rules={[{ required: true, message: '请输入调整金额' }]}
            extra="正数为充值，负数为扣款"
          >
            <Input type="number" placeholder="请输入金额，如 100 或 -50" />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea placeholder="请输入备注" rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default Users;