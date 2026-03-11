import React, { useCallback, useEffect, useState, useRef } from 'react';
import { Card, Table, Button, Space, Typography, Tag, Input, Modal, Form, Select, InputNumber, Switch, Popconfirm, App, Statistic, Row, Col } from 'antd';
import { ReloadOutlined, PlusOutlined, EditOutlined, DeleteOutlined, DownloadOutlined, RiseOutlined, FallOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import api, { getApiErrorMessage, type ApiResponse } from '../utils/api';
import PageState from '../components/PageState';

const { Title, Text } = Typography;

interface Position {
  _id: string;
  productCode: string;
  productName: string;
  customerId: string;
  customerName: string;
  quantity: number;
  price: number;
  currentPrice?: number;
  marketValue: number;
  profitLoss: number;
  returnRate?: number;
  status: string;
  currency?: string;
  market?: string;
  createdAt: string;
}

interface PositionPagination {
  page: number;
  per_page: number;
  total: number;
}

interface PositionListPayload {
  items: Position[];
  pagination: PositionPagination;
}

interface PositionStatistics {
  totalMarketValue: number;
  totalProfitLoss: number;
  totalCount: number;
}

const TradePositions: React.FC = () => {
  const { message: antdMessage } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Position[]>([]);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 });
  
  // 统计数据
  const [statistics, setStatistics] = useState<PositionStatistics | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  
  // Search state
  const [searchText, setSearchText] = useState('');
  
  // Auto refresh
  const [autoRefresh, setAutoRefresh] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [currentPosition, setCurrentPosition] = useState<Position | null>(null);
  const [form] = Form.useForm();

  // Helper to fetch customers for dropdown (simplified)
  // In a real app, we might search customers via API. For now, let's use a simple input for customerId.

  const fetchStatistics = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await api.get<ApiResponse<PositionStatistics>>('/trade/positions/statistics');
      if (res.success && res.data) {
        setStatistics(res.data);
      }
    } catch {
      // 统计加载失败不阻断主列表
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const fetchPositions = useCallback(async (page = 1, pageSize = 10, search = searchText) => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, pageSize };
      if (search) {
          // Backend currently filters by customerId only for simple users.
          // For admin, we might need a general keyword search.
          // The current backend route doesn't support 'keyword' search for positions directly.
          // But let's assume we can filter by customerId if the search looks like an ID.
          // Or we update backend to support 'keyword' search on customerName/productCode.
          // Since we didn't update backend search logic in `TradeService.get_positions` to support keyword (it supports customer_id),
          // let's pass it as customerId if strictly needed, or just warn.
          // Actually, let's assume the user enters customerId for now, or we rely on client-side filtering if data is small?
          // No, requirement says "Search".
          // Let's pass it as customerId for now.
          params.customerId = search;
      }
      
      const res = await api.get<ApiResponse<PositionListPayload>>('/trade/positions', {
        params
      });
      
      if (res.success && res.data) {
        setData(res.data.items);
        setPagination({
          current: res.data.pagination.page,
          pageSize: res.data.pagination.per_page,
          total: res.data.pagination.total,
        });
      }
    } catch (err) {
      if (!autoRefresh) { // Don't spam error on auto-refresh
         antdMessage.error(getApiErrorMessage(err, '获取持仓列表失败'));
      }
    } finally {
      setLoading(false);
    }
  }, [antdMessage, searchText, autoRefresh]);

  useEffect(() => {
    void fetchPositions(1, pagination.pageSize);
    void fetchStatistics();
  }, [fetchPositions, fetchStatistics, pagination.pageSize]);

  useEffect(() => {
      if (autoRefresh) {
          timerRef.current = setInterval(() => {
              void fetchPositions(pagination.current, pagination.pageSize);
          }, 5000);
      } else {
          if (timerRef.current) clearInterval(timerRef.current);
      }
      return () => {
          if (timerRef.current) clearInterval(timerRef.current);
      }
  }, [autoRefresh, pagination, fetchPositions]);

  const handleSearch = () => {
      void fetchPositions(1, pagination.pageSize, searchText);
  };

  const handleExport = () => {
      // Simple CSV export
      const headers = ['持仓ID', '客户', '产品代码', '产品名称', '数量', '成本价', '现价', '市值', '盈亏', '收益率', '市场', '币种', '状态', '建仓时间'];
      const csvContent = [
          headers.join(','),
          ...data.map(item => [
              item._id,
              item.customerName,
              item.productCode,
              item.productName,
              item.quantity,
              item.price,
              item.currentPrice || '',
              item.marketValue,
              item.profitLoss,
              item.returnRate ? (item.returnRate * 100).toFixed(2) + '%' : '',
              item.market || 'CN',
              item.currency || 'CNY',
              item.status,
              item.createdAt
          ].join(','))
      ].join('\n');
      
      const blob = new Blob([`\ufeff${csvContent}`], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `positions_${new Date().toISOString().slice(0,10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const handleDelete = async (id: string) => {
      try {
          await api.delete(`/trade/positions/${id}`);
          antdMessage.success('删除成功');
          void fetchPositions(pagination.current, pagination.pageSize);
          void fetchStatistics();
      } catch (err) {
          antdMessage.error(getApiErrorMessage(err, '删除失败'));
      }
  };

  const openCreateModal = () => {
      setCurrentPosition(null);
      form.resetFields();
      form.setFieldsValue({
          status: 'active',
          currency: 'CNY',
          market: 'CN',
          quantity: 100,
          price: 1.0
      });
      setIsModalOpen(true);
  };

  const openEditModal = (record: Position) => {
      setCurrentPosition(record);
      form.setFieldsValue(record);
      setIsModalOpen(true);
  };

  const handleModalOk = async () => {
      try {
          const values = await form.validateFields();
          setModalLoading(true);
          
          if (currentPosition) {
              await api.put(`/trade/positions/${currentPosition._id}`, values);
              antdMessage.success('更新成功');
          } else {
              // For create, we need customerId. 
              // In this simple UI, we ask for customerId text input.
              // We also need customerName, productName.
              await api.post('/trade/positions', values);
              antdMessage.success('创建成功');
          }
          
          setIsModalOpen(false);
          void fetchPositions(pagination.current, pagination.pageSize);
          void fetchStatistics();
      } catch (err) {
           if (err instanceof Error && err.name === 'ValidationError') return;
           antdMessage.error(getApiErrorMessage(err, currentPosition ? '更新失败' : '创建失败'));
      } finally {
          setModalLoading(false);
      }
  };

  const columns: ColumnsType<Position> = [
    { title: '持仓ID', dataIndex: '_id', key: '_id', width: 80, ellipsis: true },
    { title: '客户', dataIndex: 'customerName', key: 'customerName', width: 100, ellipsis: true },
    { 
        title: '产品', 
        key: 'product',
        width: 150,
        render: (_: unknown, record) => (
            <Space direction="vertical" size={0}>
                <Text strong>{record.productName}</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>{record.productCode}</Text>
            </Space>
        )
    },
    { 
      title: '持仓数量', 
      dataIndex: 'quantity', 
      key: 'quantity',
      render: (val: number) => val.toLocaleString()
    },
    { 
      title: '成本/现价', 
      key: 'price',
      render: (_: unknown, record) => (
          <Space direction="vertical" size={0}>
              <Text>成本: {record.price.toFixed(3)}</Text>
              {record.currentPrice && (
                  <Text type={record.currentPrice >= record.price ? "success" : "danger"}>
                      现价: {record.currentPrice.toFixed(3)}
                  </Text>
              )}
          </Space>
      )
    },
    { 
      title: '市值/盈亏', 
      key: 'marketValue',
      render: (_: unknown, record) => (
          <Space direction="vertical" size={0}>
              <Text>{record.marketValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
              <Text type={record.profitLoss >= 0 ? "success" : "danger"}>
                 {record.profitLoss > 0 ? '+' : ''}{record.profitLoss.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                 {record.returnRate !== undefined && ` (${(record.returnRate * 100).toFixed(2)}%)`}
              </Text>
          </Space>
      )
    },
    {
        title: '市场/币种',
        key: 'market',
        width: 100,
        render: (_: unknown, record) => (
            <Space split="/">
                <Text>{record.market || 'CN'}</Text>
                <Text>{record.currency || 'CNY'}</Text>
            </Space>
        )
    },
    { 
      title: '状态', 
      dataIndex: 'status', 
      key: 'status',
      width: 80,
      render: (val: Position['status']) => <Tag color={val === 'active' ? 'blue' : 'default'}>{val === 'active' ? '持仓' : '已平'}</Tag>
    },
    { 
      title: '操作', 
      key: 'action',
      width: 150,
      render: (_: unknown, record) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)} />
          <Popconfirm title="确定删除吗？" onConfirm={() => handleDelete(record._id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <Card>
      {/* 盈亏统计汇总卡片（管理员可看到所有用户账户盈亏） */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={8}>
          <Card size="small" loading={statsLoading}>
            <Statistic
              title="持仓总市値"
              value={statistics?.totalMarketValue ?? 0}
              precision={2}
              prefix="¥"
              valueStyle={{ color: '#1677ff' }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small" loading={statsLoading}>
            <Statistic
              title="总盈亏"
              value={statistics?.totalProfitLoss ?? 0}
              precision={2}
              prefix={statistics && statistics.totalProfitLoss >= 0 ? <RiseOutlined /> : <FallOutlined />}
              valueStyle={{ color: statistics && statistics.totalProfitLoss >= 0 ? '#3f8600' : '#cf1322' }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small" loading={statsLoading}>
            <Statistic
              title="持仓总数"
              value={statistics?.totalCount ?? 0}
              suffix="笔"
              valueStyle={{ color: '#1677ff' }}
            />
          </Card>
        </Col>
      </Row>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Title level={4} style={{ margin: 0 }}>持仓管理</Title>
            <Input.Search 
                placeholder="搜索客户ID" 
                style={{ width: 200 }} 
                onSearch={handleSearch}
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                allowClear
            />
        </div>
        <Space>
          <Space>
              <Text>自动刷新</Text>
              <Switch checked={autoRefresh} onChange={setAutoRefresh} />
          </Space>
          <Button icon={<DownloadOutlined />} onClick={handleExport}>导出</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>新增持仓</Button>
          <Button icon={<ReloadOutlined />} onClick={() => fetchPositions(pagination.current, pagination.pageSize)}>
            刷新
          </Button>
        </Space>
      </div>

      <PageState loading={loading && data.length === 0} error={null} onRetry={() => fetchPositions()}>
        <Table
          columns={columns}
          dataSource={data}
          rowKey="_id"
          loading={loading}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: pagination.total,
            showSizeChanger: true,
        onChange: (page, size) => fetchPositions(page, size)
          }}
          scroll={{ x: 1000 }}
        />
      </PageState>

      <Modal
          title={currentPosition ? "调整持仓" : "新增持仓"}
          open={isModalOpen}
          onOk={handleModalOk}
          onCancel={() => setIsModalOpen(false)}
          confirmLoading={modalLoading}
          width={600}
      >
          <Form
              form={form}
              layout="vertical"
          >
              {!currentPosition && (
                  <div style={{ display: 'flex', gap: 16 }}>
                      <Form.Item name="customerId" label="客户ID" rules={[{ required: true }]} style={{ flex: 1 }}>
                          <Input placeholder="输入客户ID" />
                      </Form.Item>
                      <Form.Item name="customerName" label="客户名称" rules={[{ required: true }]} style={{ flex: 1 }}>
                          <Input placeholder="输入客户名称" />
                      </Form.Item>
                  </div>
              )}
              
              <div style={{ display: 'flex', gap: 16 }}>
                  <Form.Item name="productCode" label="产品代码" rules={[{ required: true }]} style={{ flex: 1 }}>
                      <Input placeholder="如 510050" disabled={!!currentPosition} />
                  </Form.Item>
                  <Form.Item name="productName" label="产品名称" rules={[{ required: true }]} style={{ flex: 1 }}>
                      <Input placeholder="如 上证50ETF" disabled={!!currentPosition} />
                  </Form.Item>
              </div>

              <div style={{ display: 'flex', gap: 16 }}>
                  <Form.Item name="market" label="市场" initialValue="CN" style={{ flex: 1 }}>
                      <Select>
                          <Select.Option value="CN">CN (A股)</Select.Option>
                          <Select.Option value="HK">HK (港股)</Select.Option>
                          <Select.Option value="US">US (美股)</Select.Option>
                      </Select>
                  </Form.Item>
                  <Form.Item name="currency" label="币种" initialValue="CNY" style={{ flex: 1 }}>
                      <Select>
                          <Select.Option value="CNY">CNY</Select.Option>
                          <Select.Option value="USD">USD</Select.Option>
                          <Select.Option value="HKD">HKD</Select.Option>
                      </Select>
                  </Form.Item>
              </div>

              <div style={{ display: 'flex', gap: 16 }}>
                  <Form.Item name="quantity" label="持仓数量" rules={[{ required: true }]} style={{ flex: 1 }}>
                      <InputNumber style={{ width: '100%' }} min={0} />
                  </Form.Item>
                  <Form.Item name="price" label="成本均价" rules={[{ required: true }]} style={{ flex: 1 }}>
                      <InputNumber style={{ width: '100%' }} min={0} step={0.001} />
                  </Form.Item>
              </div>

              <Form.Item name="status" label="状态">
                  <Select>
                      <Select.Option value="active">持仓中 (Active)</Select.Option>
                      <Select.Option value="closed">已平仓 (Closed)</Select.Option>
                  </Select>
              </Form.Item>
          </Form>
      </Modal>
    </Card>
  );
};

export default TradePositions;
