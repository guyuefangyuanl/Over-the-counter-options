import React, { useState, useEffect, useCallback } from 'react';
import { Card, Table, Button, Tag, App, Space } from 'antd';
import { ReloadOutlined, PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import api from '../utils/api';
import { getApiErrorMessage } from '../utils/api';
import PageState from '../components/PageState';

interface Fee {
  _id: string;
  feeType: string;
  amount: number;
  customerId: string;
  customerName: string;
  orderId?: string;
  status: string;
  createdAt: string;
  description?: string;
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

const FeeList: React.FC = () => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Fee[]>([]);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 });
  const [error, setError] = useState<string | null>(null);

  const fetchFees = useCallback(async (page = 1, pageSize = 10) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<ApiResponse<PaginatedPayload<Fee>>>('/admin/fees', {
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
      const msg = getApiErrorMessage(err, '获取费用列表失败');
      setError(msg);
      message.error(msg);
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void fetchFees();
  }, [fetchFees]);

  const columns: ColumnsType<Fee> = [
    {
      title: '费用类型',
      dataIndex: 'feeType',
      key: 'feeType',
    },
    {
      title: '客户',
      dataIndex: 'customerName',
      key: 'customerName',
    },
    {
      title: '金额',
      dataIndex: 'amount',
      key: 'amount',
      render: (val) => `¥${val.toLocaleString()}`,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status) => (
        <Tag color={status === 'paid' ? 'green' : status === 'pending' ? 'orange' : 'red'}>
          {status === 'paid' ? '已支付' : status === 'pending' ? '待支付' : '已取消'}
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
          <Button type="link" size="small">查看</Button>
        </Space>
      ),
    },
  ];

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2>费用列表</h2>
        <Space>
          <Button icon={<PlusOutlined />} type="primary">新增费用</Button>
          <Button icon={<ReloadOutlined />} onClick={() => fetchFees(pagination.current, pagination.pageSize)}>
            刷新
          </Button>
        </Space>
      </div>
      <PageState
        loading={loading}
        error={error}
        empty={!loading && !error && data.length === 0}
        onRetry={() => fetchFees(pagination.current, pagination.pageSize)}
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
              void fetchFees(page, pageSize);
            },
          }}
        />
      </PageState>
    </Card>
  );
};

export default FeeList;
