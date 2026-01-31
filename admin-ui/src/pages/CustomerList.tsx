import React, { useState, useEffect, useCallback } from 'react';
import { Card, Table, Button, Tag, App, Space } from 'antd';
import { ReloadOutlined, PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import api from '../utils/api';
import { getApiErrorMessage } from '../utils/api';
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

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
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

  const fetchCustomers = useCallback(async (page = 1, pageSize = 10) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<ApiResponse<PaginatedPayload<Customer>>>('/admin/customers', {
        params: { page, pageSize },
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
  }, [message]);

  useEffect(() => {
    void fetchCustomers();
  }, [fetchCustomers]);

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
      render: (val) => val || '-',
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
      render: () => (
        <Space>
          <Button type="link" size="small">编辑</Button>
          <Button type="link" size="small">详情</Button>
        </Space>
      ),
    },
  ];

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2>客户列表</h2>
        <Space>
          <Button icon={<PlusOutlined />} type="primary">新增客户</Button>
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
    </Card>
  );
};

export default CustomerList;
