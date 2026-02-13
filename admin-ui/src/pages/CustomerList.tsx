import React, { useState, useEffect, useCallback } from 'react';
import { Card, Table, Button, Tag, App, Space, Popconfirm, Input, Modal, Form, Select } from 'antd';
import { ReloadOutlined, PlusOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import api, { getApiErrorMessage, type ApiResponse } from '../utils/api';
import PageState from '../components/PageState';

interface Customer {
  _id: string;
  name: string;
  phone: string;
  email?: string;
  status: string;
  groupName?: string;
  totalOrders: number;
  createdAt: string;
}

interface PaginatedPayload<T> {
  items: T[];
  pagination: {
    page: number;
    per_page: number;
    total: number;
  };
}

const CustomerList: React.FC = () => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Customer[]>([]);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 });
  const [error, setError] = useState<string | null>(null);
  
  // 搜索相关
  const [keyword, setKeyword] = useState('');

  // 模态框相关
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [currentCustomer, setCurrentCustomer] = useState<Customer | null>(null);
  const [form] = Form.useForm();

  // 分组选项
  const [groups, setGroups] = useState<string[]>([]);

  const fetchGroups = async () => {
      try {
          const res = await api.get<ApiResponse<{groups: string[]}>>('/admin/customer-groups');
          if (res.success && res.data?.groups) {
              setGroups(res.data.groups);
          }
      } catch (e) {
          console.error("Fetch groups failed", e);
      }
  }

  useEffect(() => {
      void fetchGroups();
  }, []);

  const fetchCustomers = useCallback(async (page = 1, pageSize = 10, searchKeyword = keyword) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<ApiResponse<PaginatedPayload<Customer>>>('/admin/customers', {
        params: { page, pageSize, keyword: searchKeyword },
      });
      if (res.success && res.data?.pagination && Array.isArray(res.data.items)) {
        setData(res.data.items);
        setPagination({
          current: res.data.pagination.page,
          pageSize: res.data.pagination.per_page,
          total: res.data.pagination.total,
        });
      }
    } catch (err) {
      const msg = getApiErrorMessage(err, '获取客户列表失败');
      setError(msg);
      message.error(msg);
    } finally {
      setLoading(false);
    }
  }, [message, keyword]);

  // 初始加载
  useEffect(() => {
    void fetchCustomers(1, 10, '');
  }, []);

  const handleSearch = (value: string) => {
      setKeyword(value);
      void fetchCustomers(1, pagination.pageSize, value);
  };

  const handleDelete = async (id: string) => {
      try {
          await api.delete(`/admin/customers/${id}`);
          message.success('删除成功');
          void fetchCustomers(pagination.current, pagination.pageSize);
      } catch (err) {
          message.error(getApiErrorMessage(err, '删除失败'));
      }
  }

  const openCreateModal = () => {
      setCurrentCustomer(null);
      form.resetFields();
      form.setFieldsValue({ status: 'active' });
      setIsModalOpen(true);
  };

  const openEditModal = (record: Customer) => {
      setCurrentCustomer(record);
      form.setFieldsValue(record);
      setIsModalOpen(true);
  };

  const handleModalOk = async () => {
      try {
          const values = await form.validateFields();
          setModalLoading(true);
          
          if (currentCustomer) {
              // Update
              await api.put(`/admin/customers/${currentCustomer._id}`, values);
              message.success('更新成功');
          } else {
              // Create
              await api.post('/admin/customers', values);
              message.success('创建成功');
          }
          
          setIsModalOpen(false);
          void fetchCustomers(pagination.current, pagination.pageSize);
          // 刷新分组列表以防有新分组
          if (values.groupName && !groups.includes(values.groupName)) {
              void fetchGroups();
          }
      } catch (err) {
          if (err instanceof Error && err.name === 'ValidationError') {
              return;
          }
          message.error(getApiErrorMessage(err, currentCustomer ? '更新失败' : '创建失败'));
      } finally {
          setModalLoading(false);
      }
  };

  const columns: ColumnsType<Customer> = [
    {
      title: '客户名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '联系方式',
      dataIndex: 'phone',
      key: 'phone',
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
    },
    {
      title: '分组',
      dataIndex: 'groupName',
      key: 'groupName',
      render: (val) => val ? <Tag>{val}</Tag> : '-',
    },
    {
      title: '订单数',
      dataIndex: 'totalOrders',
      key: 'totalOrders',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status) => (
        <Tag color={status === 'active' ? 'green' : 'red'}>
          {status === 'active' ? '正常' : '停用'}
        </Tag>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (val) => new Date(val).toLocaleString(),
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)}>编辑</Button>
          <Popconfirm title="确定删除吗？" onConfirm={() => handleDelete(record._id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
            <h2 style={{ margin: '0 16px 0 0' }}>客户列表</h2>
            <Input.Search 
                placeholder="搜索姓名或手机号" 
                onSearch={handleSearch}
                style={{ width: 250 }}
                allowClear
            />
        </div>
        <Space>
          <Button icon={<PlusOutlined />} type="primary" onClick={openCreateModal}>新增客户</Button>
          <Button icon={<ReloadOutlined />} onClick={() => fetchCustomers(pagination.current, pagination.pageSize)}>
            刷新
          </Button>
        </Space>
      </div>
      
      <PageState
        loading={loading}
        error={error}
        empty={!loading && !error && data.length === 0}
        onRetry={() => fetchCustomers(pagination.current, pagination.pageSize)}
      >
        <Table
          columns={columns}
          dataSource={data}
          rowKey="_id"
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: pagination.total,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 条`,
            onChange: (page, pageSize) => {
              setPagination((prev) => ({ ...prev, current: page, pageSize }));
              void fetchCustomers(page, pageSize);
            },
          }}
        />
      </PageState>

      <Modal
          title={currentCustomer ? "编辑客户" : "新增客户"}
          open={isModalOpen}
          onOk={handleModalOk}
          onCancel={() => setIsModalOpen(false)}
          confirmLoading={modalLoading}
      >
          <Form
              form={form}
              layout="vertical"
              initialValues={{ status: 'active' }}
          >
              <Form.Item
                  name="name"
                  label="客户名称"
                  rules={[{ required: true, message: '请输入客户名称' }]}
              >
                  <Input placeholder="请输入客户名称" />
              </Form.Item>
              <Form.Item
                  name="phone"
                  label="手机号"
                  rules={[{ required: true, message: '请输入手机号' }]}
              >
                  <Input placeholder="请输入手机号" />
              </Form.Item>
              <Form.Item
                  name="email"
                  label="邮箱"
                  rules={[{ type: 'email', message: '请输入有效的邮箱地址' }]}
              >
                  <Input placeholder="请输入邮箱" />
              </Form.Item>
              <Form.Item
                  name="groupName"
                  label="分组"
              >
                   <Select
                        mode="tags" 
                        style={{ width: '100%' }} 
                        placeholder="选择或输入分组"
                        options={groups.map(g => ({ label: g, value: g }))}
                        maxCount={1}
                    />
              </Form.Item>
              <Form.Item
                  name="status"
                  label="状态"
                  rules={[{ required: true, message: '请选择状态' }]}
              >
                  <Select>
                      <Select.Option value="active">正常</Select.Option>
                      <Select.Option value="inactive">停用</Select.Option>
                  </Select>
              </Form.Item>
          </Form>
      </Modal>
    </Card>
  );
};

export default CustomerList;