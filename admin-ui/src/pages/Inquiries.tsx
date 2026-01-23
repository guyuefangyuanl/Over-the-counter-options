import React, { useCallback, useEffect, useState, useRef } from 'react';
import { App, Table, Button, Tag, Modal, Form, Input, Select, Card, Typography, DatePicker, Space, Statistic, Row, Col, Tooltip } from 'antd';
import { ReloadOutlined, EditOutlined, ExportOutlined, CheckCircleOutlined, ClockCircleOutlined, CloseCircleOutlined, SyncOutlined } from '@ant-design/icons';
import api, { getApiErrorMessage, type ApiResponse } from '../utils/api';
import type { ColumnsType } from 'antd/es/table';
import PageState from '../components/PageState';
import { notificationManager } from '../utils/notification';

const { Title, Text } = Typography;
const { Option } = Select;
const { RangePicker } = DatePicker;

interface Inquiry {
  _id: string;
  selectedProduct?: Product;
  productName?: string;
  productCode?: string;
  optionType?: string;
  structure?: string;
  term?: string;
  notionalAmount?: number | string;
  strikePrice?: number | string;
  selectedDealers?: string[];
  contactName: string;
  phone: string;
  status: 'pending' | 'processing' | 'completed' | 'rejected';
  createdAt: string;
  remark?: string;
  notes?: string;
  history?: InquiryHistory[];
}

interface InquiryHistory {
  status: string;
  remark?: string;
  operator?: string;
  time: string;
}

interface Product {
  name?: string;
  code?: string;
  structure?: string;
  term?: string;
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

type InquiryFilters = {
  status?: string;
  keyword?: string;
  startDate?: string;
  endDate?: string;
};

type InquiryFilterFormValues = {
  status?: string;
  keyword?: string;
  dateRange?: [unknown, unknown];
};

const Inquiries: React.FC = () => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Inquiry[]>([]);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 });
  const [filters, setFilters] = useState<InquiryFilters>({});
  const [error, setError] = useState<string | null>(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [currentInquiry, setCurrentInquiry] = useState<Inquiry | null>(null);
  const [form] = Form.useForm();
  const [filterForm] = Form.useForm<InquiryFilterFormValues>();
  const [statistics, setStatistics] = useState({ pending: 0, processing: 0, completed: 0, rejected: 0 });
  const [autoRefresh, setAutoRefresh] = useState(true);
  const autoRefreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  const maskPhone = (phone: string) => phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2');

  const fetchInquiries = useCallback(async (page = 1, pageSize = 10, nextFilters: InquiryFilters = {}, silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await api.get<ApiResponse<PaginatedPayload<Inquiry>>>('/admin/inquiries', {
        params: { page, pageSize, ...nextFilters },
      });
      if (res.success && res.data?.pagination && Array.isArray(res.data.items)) {
        // 检查是否有新询价并通知 (仅在静默刷新且页码为1时)
        if (silent && page === 1 && data.length > 0 && res.data.items.length > 0) {
          const firstOld = data[0]._id;
          const firstNew = res.data.items[0]._id;
          if (firstOld !== firstNew) {
            const newItem = res.data.items[0];
            notificationManager.notifyNewInquiry(
              newItem.contactName || '新客户',
              newItem.productName || newItem.selectedProduct?.name || '未知产品'
            );
          }
        }

        setData(res.data.items);
        setPagination({
          current: res.data.pagination.page,
          pageSize: res.data.pagination.per_page,
          total: res.data.pagination.total,
        });
      }
    } catch (err) {
      const msg = getApiErrorMessage(err, '获取询价列表失败');
      setError(msg);
      if (!silent) message.error(msg);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [message]);

  const fetchStatistics = useCallback(async () => {
    try {
      const res = await api.get<ApiResponse<any>>('/admin/inquiries/statistics');
      if (res.success && res.data) {
        setStatistics(res.data);
      }
    } catch (err) {
      console.error('获取统计信息失败:', err);
    }
  }, []);

  const currentPage = pagination.current;
  const pageSize = pagination.pageSize;

  useEffect(() => {
    void fetchInquiries(currentPage, pageSize, filters);
    void fetchStatistics();
  }, [fetchInquiries, fetchStatistics, filters, currentPage, pageSize]);

  // 自动刷新
  useEffect(() => {
    if (autoRefresh) {
      autoRefreshTimerRef.current = setInterval(() => {
        void fetchInquiries(currentPage, pageSize, filters, true);
        void fetchStatistics();
      }, 30000); // 每30秒刷新一次
    } else {
      if (autoRefreshTimerRef.current) {
        clearInterval(autoRefreshTimerRef.current);
        autoRefreshTimerRef.current = null;
      }
    }

    return () => {
      if (autoRefreshTimerRef.current) {
        clearInterval(autoRefreshTimerRef.current);
      }
    };
  }, [autoRefresh, currentPage, pageSize, filters, fetchInquiries, fetchStatistics]);

  const handleUpdateStatus = (inquiry: Inquiry) => {
    setCurrentInquiry(inquiry);
    form.setFieldsValue({
      status: inquiry.status,
      remark: inquiry.remark,
    });
    setIsModalVisible(true);
  };

  const handleModalOk = async () => {
    if (!currentInquiry) {
      message.error('请选择要处理的询价');
      return;
    }

    try {
      const values = await form.validateFields();

      const res = await api.put<ApiResponse<unknown>>(
        `/admin/inquiries/${currentInquiry._id}/status`,
        values
      );
      if (res.success) {
        message.success('更新成功');
        setIsModalVisible(false);
        void fetchInquiries(pagination.current, pagination.pageSize, filters);
        void fetchStatistics();
      }
    } catch (err) {
      message.error(getApiErrorMessage(err, '更新失败'));
    }
  };

  const handleBatchUpdate = async (status: string) => {
    if (selectedRowKeys.length === 0) {
      message.warning('请先选择要批量处理的询价');
      return;
    }

    try {
      const res = await api.post<ApiResponse<unknown>>('/admin/inquiries/batch-update', {
        ids: selectedRowKeys,
        status,
      });
      if (res.success) {
        message.success(`已批量更新${selectedRowKeys.length}条询价`);
        setSelectedRowKeys([]);
        void fetchInquiries(pagination.current, pagination.pageSize, filters);
        void fetchStatistics();
      }
    } catch (err) {
      message.error(getApiErrorMessage(err, '批量更新失败'));
    }
  };

  const handleExport = async () => {
    try {
      message.loading({ content: '正在导出...', key: 'export' });
      const res = await api.get('/admin/inquiries/export', {
        params: filters,
        responseType: 'blob',
      });
      
      const blob = new Blob([res as unknown as BlobPart], { type: 'application/vnd.ms-excel' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `inquiries_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      message.success({ content: '导出成功', key: 'export' });
    } catch (err) {
      message.error({ content: getApiErrorMessage(err, '导出失败'), key: 'export' });
    }
  };

  const isDayjsLike = (v: unknown): v is { format: (format: string) => string } =>
    !!v && typeof v === 'object' && 'format' in v && typeof (v as { format?: unknown }).format === 'function';

  const handleFilterSubmit = useCallback((values: InquiryFilterFormValues) => {
    const next: InquiryFilters = {};
    if (typeof values.status === 'string' && values.status.trim() !== '') next.status = values.status;
    if (typeof values.keyword === 'string' && values.keyword.trim() !== '') next.keyword = values.keyword.trim();

    const range = values.dateRange;
    if (Array.isArray(range) && range.length === 2) {
      const [start, end] = range;
      if (isDayjsLike(start)) next.startDate = start.format('YYYY-MM-DD');
      if (isDayjsLike(end)) next.endDate = end.format('YYYY-MM-DD');
    }

    setFilters(next);
    setPagination((prev) => ({ ...prev, current: 1 }));
    void fetchInquiries(1, pagination.pageSize, next);
  }, [fetchInquiries, pagination.pageSize]);

  const handleFilterReset = useCallback(() => {
    filterForm.resetFields();
    setFilters({});
    setPagination((prev) => ({ ...prev, current: 1 }));
    void fetchInquiries(1, pagination.pageSize, {});
  }, [fetchInquiries, filterForm, pagination.pageSize]);

  const getStatusTag = (status: string) => {
    const statusMap: Record<string, { color: string; text: string }> = {
      pending: { color: 'gold', text: '待处理' },
      processing: { color: 'blue', text: '处理中' },
      completed: { color: 'green', text: '已完成' },
      rejected: { color: 'red', text: '已拒绝' },
    };
    const { color, text } = statusMap[status] || { color: 'default', text: status };
    return <Tag color={color}>{text}</Tag>;
  };

  const columns: ColumnsType<Inquiry> = [
    {
      title: '产品信息',
      key: 'product',
      width: 220,
      render: (_, record) => (
        <div>
          <div style={{ fontWeight: 'bold' }}>
            {record.productName || record.selectedProduct?.name} ({record.productCode || record.selectedProduct?.code})
          </div>
          <Space size={4} split={<Text type="secondary">|</Text>}>
            <Text type="secondary">{record.optionType === 'call' ? '看涨' : record.optionType === 'put' ? '看跌' : record.optionType}</Text>
            <Text type="secondary">{record.structure}</Text>
            <Text type="secondary">{record.term}</Text>
          </Space>
        </div>
      ),
    },
    {
      title: '询价要素',
      key: 'elements',
      width: 180,
      render: (_, record) => (
        <div>
          <div>名义本金: <Text strong>{record.notionalAmount}</Text> 万</div>
          <div>行权价: <Text strong>{record.strikePrice}%</Text></div>
        </div>
      ),
    },
    {
      title: '联系人',
      key: 'contact',
      width: 180,
      render: (_, record) => (
        <div>
          <div>{record.contactName}</div>
          <div style={{ fontSize: '12px', color: '#666' }}>{maskPhone(record.phone)}</div>
        </div>
      ),
    },
    {
      title: '交易商',
      dataIndex: 'selectedDealers',
      key: 'dealers',
      width: 150,
      render: (dealers: string[]) => (
        <Space size={2} wrap>
          {Array.isArray(dealers) ? dealers.map(d => <Tag key={d} size="small">{d}</Tag>) : '-'}
        </Space>
      )
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status) => getStatusTag(status),
    },
    {
      title: '提交时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (val) => new Date(val).toLocaleString(),
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      fixed: 'right',
      render: (_, record) => (
        <Button icon={<EditOutlined />} onClick={() => handleUpdateStatus(record)}>
          处理
        </Button>
      ),
    },
  ];

  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: React.Key[]) => setSelectedRowKeys(keys),
  };

  return (
    <Card>
      {/* 统计卡片 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="待处理"
              value={statistics.pending}
              valueStyle={{ color: '#faad14' }}
              prefix={<ClockCircleOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="处理中"
              value={statistics.processing}
              valueStyle={{ color: '#1890ff' }}
              prefix={<SyncOutlined spin />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="已完成"
              value={statistics.completed}
              valueStyle={{ color: '#52c41a' }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="已拒绝"
              value={statistics.rejected}
              valueStyle={{ color: '#ff4d4f' }}
              prefix={<CloseCircleOutlined />}
            />
          </Card>
        </Col>
      </Row>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4}>询价处理</Title>
        <Space>
          <Tooltip title={autoRefresh ? '自动刷新已开启' : '自动刷新已关闭'}>
            <Button
              type={autoRefresh ? 'primary' : 'default'}
              icon={<SyncOutlined spin={autoRefresh} />}
              onClick={() => setAutoRefresh(!autoRefresh)}
            >
              {autoRefresh ? '自动' : '手动'}
            </Button>
          </Tooltip>
          <Button icon={<ReloadOutlined />} onClick={() => {void fetchInquiries(pagination.current, pagination.pageSize, filters); void fetchStatistics();}}>
            刷新
          </Button>
          <Button icon={<ExportOutlined />} onClick={handleExport}>
            导出
          </Button>
        </Space>
      </div>
      <Form form={filterForm} layout="inline" onFinish={handleFilterSubmit} style={{ marginBottom: 16 }}>
        <Form.Item name="status" label="状态">
          <Select allowClear style={{ width: 140 }} placeholder="全部">
            <Option value="pending">待处理</Option>
            <Option value="processing">处理中</Option>
            <Option value="completed">已完成</Option>
            <Option value="rejected">已拒绝</Option>
          </Select>
        </Form.Item>
        <Form.Item name="dateRange" label="日期">
          <RangePicker />
        </Form.Item>
        <Form.Item name="keyword" label="关键词">
          <Input allowClear placeholder="联系人/手机号/产品" style={{ width: 240 }} />
        </Form.Item>
        <Space>
          <Button type="primary" htmlType="submit">筛选</Button>
          <Button onClick={handleFilterReset}>重置</Button>
        </Space>
      </Form>
      {selectedRowKeys.length > 0 && (
        <div style={{ marginBottom: 16, padding: '12px 16px', background: '#e6f7ff', borderRadius: 4 }}>
          <Space>
            <span>已选择 {selectedRowKeys.length} 项</span>
            <Button size="small" onClick={() => handleBatchUpdate('processing')}>批量标记为处理中</Button>
            <Button size="small" onClick={() => handleBatchUpdate('completed')}>批量标记为已完成</Button>
            <Button size="small" danger onClick={() => handleBatchUpdate('rejected')}>批量标记为已拒绝</Button>
            <Button size="small" onClick={() => setSelectedRowKeys([])}>取消选择</Button>
          </Space>
        </div>
      )}

      <PageState
        loading={loading}
        error={error}
        empty={!loading && !error && data.length === 0}
        onRetry={() => {void fetchInquiries(pagination.current, pagination.pageSize, filters); void fetchStatistics();}}
      >
        <Table
          columns={columns}
          dataSource={data}
          rowKey="_id"
          rowSelection={rowSelection}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: pagination.total,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 条`,
            onChange: (page, pageSize) => {
              setPagination((prev) => ({ ...prev, current: page, pageSize }));
              void fetchInquiries(page, pageSize, filters);
            },
          }}
        />
      </PageState>

      <Modal
        title="处理询价"
        open={isModalVisible}
        onOk={handleModalOk}
        onCancel={() => setIsModalVisible(false)}
        width={600}
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="客户姓名">
                <Input value={currentInquiry?.contactName} disabled />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="客户电话">
                <Input value={currentInquiry?.phone} disabled />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="询价要素">
            <div style={{ padding: '8px 12px', background: '#f5f5f5', borderRadius: 4 }}>
              <Row gutter={16}>
                <Col span={12}>产品: {currentInquiry?.productName || currentInquiry?.selectedProduct?.name}</Col>
                <Col span={12}>代码: {currentInquiry?.productCode || currentInquiry?.selectedProduct?.code}</Col>
              </Row>
              <Row gutter={16} style={{ marginTop: 8 }}>
                <Col span={8}>结构: {currentInquiry?.structure}</Col>
                <Col span={8}>期限: {currentInquiry?.term}</Col>
                <Col span={8}>方向: {currentInquiry?.optionType === 'call' ? '看涨' : currentInquiry?.optionType === 'put' ? '看跌' : currentInquiry?.optionType}</Col>
              </Row>
              <Row gutter={16} style={{ marginTop: 8 }}>
                <Col span={12}>名义本金: {currentInquiry?.notionalAmount} 万</Col>
                <Col span={12}>行权价: {currentInquiry?.strikePrice}%</Col>
              </Row>
              {currentInquiry?.notes && (
                <div style={{ marginTop: 8 }}>备注: {currentInquiry.notes}</div>
              )}
            </div>
          </Form.Item>
          
          <Form.Item name="status" label="更新状态" rules={[{ required: true }]}>
            <Select>
              <Option value="pending">待处理</Option>
              <Option value="processing">处理中</Option>
              <Option value="completed">已完成</Option>
              <Option value="rejected">已拒绝</Option>
            </Select>
          </Form.Item>
          <Form.Item name="remark" label="处理备注">
            <Input.TextArea rows={2} placeholder="输入处理结果或备注..." />
          </Form.Item>

          {currentInquiry?.history && currentInquiry.history.length > 0 && (
            <Form.Item label="处理历史">
              <div style={{ maxHeight: 150, overflowY: 'auto', border: '1px solid #eee', padding: 8 }}>
                {currentInquiry.history.map((h, i) => (
                  <div key={i} style={{ fontSize: '12px', marginBottom: 8, borderBottom: '1px dashed #eee', paddingBottom: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Space>
                        {getStatusTag(h.status)}
                        <Text strong>{h.operator || '未知操作人'}</Text>
                      </Space>
                      <Text type="secondary">{new Date(h.time).toLocaleString()}</Text>
                    </div>
                    {h.remark && <div style={{ marginTop: 2 }}>备注: {h.remark}</div>}
                  </div>
                ))}
              </div>
            </Form.Item>
          )}
        </Form>
      </Modal>
    </Card>
  );
};

export default Inquiries;
