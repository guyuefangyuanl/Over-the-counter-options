import React, { useCallback, useEffect, useState } from 'react';
import { App, Table, Button, Card, Typography, Tag } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import api, { getApiErrorMessage, type ApiResponse } from '../utils/api';
import type { ColumnsType } from 'antd/es/table';
import PageState from '../components/PageState';

const { Title } = Typography;

interface Order {
  _id: string;
  orderId: string;
  productName: string;
  productCode: string;
  quantity: number;
  amount: number;
  status: string;
  createdAt: string;
}

type PaginatedPayload<T> = {
  items: T[];
  pagination: {
    page: number;
    per_page: number;
    total: number;
    pages: number;
  };
};

const Orders: React.FC = () => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Order[]>([]);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 });
  const [error, setError] = useState<string | null>(null);

  const fetchOrders = useCallback(async (page = 1, pageSize = 10) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<ApiResponse<PaginatedPayload<Order>>>('/admin/orders', {
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
      const msg = getApiErrorMessage(err, '获取订单列表失败');
      setError(msg);
      message.error(msg);
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void fetchOrders();
  }, [fetchOrders]);

  const columns: ColumnsType<Order> = [
    {
      title: '订单号',
      dataIndex: 'orderId',
      key: 'orderId',
    },
    {
      title: '产品',
      key: 'product',
      render: (_, record) => `${record.productName} (${record.productCode})`,
    },
    {
      title: '数量',
      dataIndex: 'quantity',
      key: 'quantity',
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
      render: (status) => <Tag color="green">{status || '已成交'}</Tag>,
    },
    {
      title: '成交时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (val) => new Date(val).toLocaleString(),
    },
  ];

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4}>订单管理</Title>
        <Button icon={<ReloadOutlined />} onClick={() => fetchOrders(pagination.current, pagination.pageSize)}>
          刷新
        </Button>
      </div>
      <PageState
        loading={loading}
        error={error}
        empty={!loading && !error && data.length === 0}
        onRetry={() => fetchOrders(pagination.current, pagination.pageSize)}
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
              void fetchOrders(page, pageSize);
            },
          }}
        />
      </PageState>
    </Card>
  );
};

export default Orders;
