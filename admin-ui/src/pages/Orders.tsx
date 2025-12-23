import React, { useState, useEffect } from 'react';
import { Table, Button, Card, Typography, message, Tag } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import api from '../utils/api';
import type { ColumnsType } from 'antd/es/table';

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

const Orders: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Order[]>([]);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const res: any = await api.get('/admin/orders');
      if (res.success) {
        setData(res.data);
      }
    } catch (error) {
      message.error('获取订单列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

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
        <Button icon={<ReloadOutlined />} onClick={fetchOrders}>
          刷新
        </Button>
      </div>
      <Table
        columns={columns}
        dataSource={data}
        rowKey="_id"
        loading={loading}
      />
    </Card>
  );
};

export default Orders;
