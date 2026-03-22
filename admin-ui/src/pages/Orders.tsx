import React, { useCallback, useEffect, useState } from 'react';
import { App, Table, Button, Card, Typography, Tag, Space, Select, Input, Badge, Tooltip, Modal, Descriptions } from 'antd';
import { ReloadOutlined, EyeOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import api, { getApiErrorMessage, type ApiResponse } from '../utils/api';
import type { ColumnsType } from 'antd/es/table';
import PageState from '../components/PageState';

const { Title, Text } = Typography;

interface Order {
  _id: string;
  orderId: string;
  openid: string;
  customerName?: string;
  productName: string;
  productCode: string;
  optionType?: string;
  quantity: number;
  price?: number;
  amount: number;
  notionalAmount?: number;
  status: string;
  orderType?: string;
  remark?: string;
  createdAt: string;
  updatedAt?: string;
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

const statusConfig: Record<string, { color: string; label: string; badge: 'success' | 'processing' | 'error' | 'warning' | 'default' }> = {
  pending: { color: 'default', label: '待处理', badge: 'default' },
  processing: { color: 'blue', label: '处理中', badge: 'processing' },
  confirmed: { color: 'cyan', label: '已确认', badge: 'processing' },
  filled: { color: 'green', label: '已成交', badge: 'success' },
  cancelled: { color: 'red', label: '已取消', badge: 'error' },
  rejected: { color: 'red', label: '已拒绝', badge: 'error' },
  expired: { color: 'orange', label: '已过期', badge: 'warning' },
};

const Orders: React.FC = () => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Order[]>([]);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 });
  const [error, setError] = useState<string | null>(null);
  
  // 筛选条件
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [keyword, setKeyword] = useState('');
  
  // 详情模态框
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [currentOrder, setCurrentOrder] = useState<Order | null>(null);

  const fetchOrders = useCallback(async (page = 1, pageSize = 10, status?: string, search?: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<ApiResponse<PaginatedPayload<Order>>>('/trade/orders', {
        params: { 
          page, 
          pageSize, 
          status: status || undefined,
          customerId: undefined, // Admin can see all
        },
      });
      if (res.success && res.data?.pagination && Array.isArray(res.data.items)) {
        // 如果有搜索关键词，在前端过滤（后端可能不支持搜索）
        let filteredItems = res.data.items;
        if (search) {
          filteredItems = res.data.items.filter(item => 
            item.productName?.includes(search) ||
            item.productCode?.includes(search) ||
            item.orderId?.includes(search) ||
            item.customerName?.includes(search)
          );
        }
        
        setData(filteredItems);
        setPagination({
          current: res.data.pagination.page,
          pageSize: res.data.pagination.per_page,
          total: search ? filteredItems.length : res.data.pagination.total,
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

  // 更新订单状态
  const handleUpdateStatus = useCallback(async (orderId: string, newStatus: string) => {
    try {
      const res = await api.put<ApiResponse<void>>(`/trade/orders/${orderId}/status`, { status: newStatus });
      if (res.success) {
        message.success('状态更新成功');
        void fetchOrders(pagination.current, pagination.pageSize, statusFilter, keyword);
      }
    } catch (err) {
      message.error(getApiErrorMessage(err, '更新状态失败'));
    }
  }, [fetchOrders, message, pagination, statusFilter, keyword]);

  const openDetail = (record: Order) => {
    setCurrentOrder(record);
    setIsDetailOpen(true);
  };

  useEffect(() => {
    void fetchOrders();
  }, [fetchOrders]);

  const handleSearch = () => {
    void fetchOrders(1, pagination.pageSize, statusFilter, keyword);
  };

  const handleStatusChange = (status: string | undefined) => {
    setStatusFilter(status);
    void fetchOrders(1, pagination.pageSize, status, keyword);
  };

  const columns: ColumnsType<Order> = [
    {
      title: '订单号',
      dataIndex: 'orderId',
      key: 'orderId',
      width: 180,
      render: (val) => <Text copyable={{ text: val }}>{val?.slice(0, 12)}...</Text>,
    },
    {
      title: '客户',
      key: 'customer',
      width: 120,
      render: (_, record) => record.customerName || record.openid?.slice(0, 8) || '-',
    },
    {
      title: '产品',
      key: 'product',
      width: 200,
      render: (_, record) => (
        <div>
          <Text strong>{record.productName}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>{record.productCode}</Text>
          {record.optionType && (
            <Tag style={{ marginLeft: 4 }} color={record.optionType === 'call' ? 'green' : 'red'}>
              {record.optionType === 'call' ? '看涨' : '看跌'}
            </Tag>
          )}
        </div>
      ),
    },
    {
      title: '数量',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 100,
      align: 'right',
      render: (val) => val?.toLocaleString() || '-',
    },
    {
      title: '金额',
      dataIndex: 'amount',
      key: 'amount',
      width: 120,
      align: 'right',
      render: (val) => <Text type="success">¥{Number(val || 0).toLocaleString()}</Text>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status) => {
        const config = statusConfig[status] || { color: 'default', label: status, badge: 'default' as const };
        return <Badge status={config.badge} text={config.label} />;
      },
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 160,
      render: (val) => val ? new Date(val).toLocaleString() : '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      fixed: 'right',
      render: (_, record) => {
        const status = record.status;
        return (
          <Space size="small">
            <Tooltip title="查看详情">
              <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => openDetail(record)}>
                详情
              </Button>
            </Tooltip>
            {status === 'pending' && (
              <>
                <Button 
                  type="link" 
                  size="small" 
                  icon={<CheckCircleOutlined />}
                  onClick={() => handleUpdateStatus(record._id, 'confirmed')}
                >
                  确认
                </Button>
                <Button 
                  type="link" 
                  size="small" 
                  danger
                  icon={<CloseCircleOutlined />}
                  onClick={() => handleUpdateStatus(record._id, 'cancelled')}
                >
                  取消
                </Button>
              </>
            )}
            {status === 'confirmed' && (
              <Button 
                type="link" 
                size="small" 
                icon={<CheckCircleOutlined />}
                onClick={() => handleUpdateStatus(record._id, 'filled')}
              >
                成交
              </Button>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 16 }}>
        <Title level={4} style={{ margin: 0 }}>订单管理</Title>
        <Space>
          <Input.Search
            placeholder="搜索产品/客户"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onSearch={handleSearch}
            style={{ width: 200 }}
            allowClear
          />
          <Select
            placeholder="订单状态"
            style={{ width: 120 }}
            allowClear
            value={statusFilter}
            onChange={handleStatusChange}
          >
            <Select.Option value="pending">待处理</Select.Option>
            <Select.Option value="processing">处理中</Select.Option>
            <Select.Option value="confirmed">已确认</Select.Option>
            <Select.Option value="filled">已成交</Select.Option>
            <Select.Option value="cancelled">已取消</Select.Option>
            <Select.Option value="rejected">已拒绝</Select.Option>
          </Select>
          <Button icon={<ReloadOutlined />} onClick={() => fetchOrders(pagination.current, pagination.pageSize, statusFilter, keyword)}>
            刷新
          </Button>
        </Space>
      </div>

      <PageState
        loading={loading}
        error={error}
        empty={!loading && !error && data.length === 0}
        onRetry={() => fetchOrders(pagination.current, pagination.pageSize, statusFilter, keyword)}
      >
        <Table
          columns={columns}
          dataSource={data}
          rowKey="_id"
          scroll={{ x: 1200 }}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: pagination.total,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 条`,
            onChange: (page, pageSize) => {
              setPagination((prev) => ({ ...prev, current: page, pageSize }));
              void fetchOrders(page, pageSize, statusFilter, keyword);
            },
          }}
        />
      </PageState>

      {/* 订单详情模态框 */}
      <Modal
        title="订单详情"
        open={isDetailOpen}
        onCancel={() => setIsDetailOpen(false)}
        footer={[
          <Button key="close" onClick={() => setIsDetailOpen(false)}>
            关闭
          </Button>,
        ]}
        width={600}
      >
        {currentOrder && (
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="订单号" span={2}>
              <Text copyable>{currentOrder.orderId}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="客户ID">{currentOrder.openid}</Descriptions.Item>
            <Descriptions.Item label="客户名称">{currentOrder.customerName || '-'}</Descriptions.Item>
            <Descriptions.Item label="产品名称">{currentOrder.productName}</Descriptions.Item>
            <Descriptions.Item label="产品代码">{currentOrder.productCode}</Descriptions.Item>
            <Descriptions.Item label="期权类型">
              {currentOrder.optionType === 'call' ? '看涨' : currentOrder.optionType === 'put' ? '看跌' : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="数量">{currentOrder.quantity?.toLocaleString()}</Descriptions.Item>
            <Descriptions.Item label="价格">{currentOrder.price ? `¥${currentOrder.price}` : '-'}</Descriptions.Item>
            <Descriptions.Item label="金额">
              <Text type="success">¥{Number(currentOrder.amount || 0).toLocaleString()}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={statusConfig[currentOrder.status]?.color || 'default'}>
                {statusConfig[currentOrder.status]?.label || currentOrder.status}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="订单类型">{currentOrder.orderType || '-'}</Descriptions.Item>
            <Descriptions.Item label="创建时间">
              {currentOrder.createdAt ? new Date(currentOrder.createdAt).toLocaleString() : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="更新时间">
              {currentOrder.updatedAt ? new Date(currentOrder.updatedAt).toLocaleString() : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="备注" span={2}>
              {currentOrder.remark || '-'}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </Card>
  );
};

export default Orders;