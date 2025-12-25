import React, { useCallback, useEffect, useState } from 'react';
import { App, Table, Button, Tag, Modal, Form, Input, Select, Card, Typography, DatePicker, Space } from 'antd';
import { ReloadOutlined, EditOutlined } from '@ant-design/icons';
import api, { getApiErrorMessage, type ApiResponse } from '../utils/api';
import type { ColumnsType } from 'antd/es/table';
import PageState from '../components/PageState';

const { Title } = Typography;
const { Option } = Select;
const { RangePicker } = DatePicker;

interface Inquiry {
  _id: string;
  selectedProduct?: Product;
  quantity: number;
  contactName: string;
  phone: string;
  status: 'pending' | 'processing' | 'completed' | 'rejected';
  createdAt: string;
  remark?: string;
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

  const maskPhone = (phone: string) => phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2');

  const fetchInquiries = useCallback(async (page = 1, pageSize = 10, nextFilters: InquiryFilters = {}) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<ApiResponse<PaginatedPayload<Inquiry>>>('/admin/inquiries', {
        params: { page, pageSize, ...nextFilters },
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
      const msg = getApiErrorMessage(err, '获取询价列表失败');
      setError(msg);
      message.error(msg);
    } finally {
      setLoading(false);
    }
  }, [message]);

  const currentPage = pagination.current;
  const pageSize = pagination.pageSize;

  useEffect(() => {
    void fetchInquiries(currentPage, pageSize, filters);
  }, [fetchInquiries, filters, currentPage, pageSize]);

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
      }
    } catch (err) {
      message.error(getApiErrorMessage(err, '更新失败'));
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
      dataIndex: 'selectedProduct',
      key: 'product',
      render: (product) => (
        <div>
          <div style={{ fontWeight: 'bold' }}>{product?.name} ({product?.code})</div>
          <div style={{ fontSize: '12px', color: '#666' }}>{product?.structure} | {product?.term}</div>
        </div>
      ),
    },
    {
      title: '询价数量',
      dataIndex: 'quantity',
      key: 'quantity',
    },
    {
      title: '联系人',
      dataIndex: 'contactName',
      key: 'contactName',
      render: (text, record) => (
        <div>
          <div>{text}</div>
          <div style={{ fontSize: '12px', color: '#666' }}>{maskPhone(record.phone)}</div>
        </div>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status) => getStatusTag(status),
    },
    {
      title: '提交时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (val) => new Date(val).toLocaleString(),
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <Button icon={<EditOutlined />} onClick={() => handleUpdateStatus(record)}>
          处理
        </Button>
      ),
    },
  ];

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4}>询价处理</Title>
        <Button icon={<ReloadOutlined />} onClick={() => fetchInquiries(pagination.current, pagination.pageSize, filters)}>
          刷新
        </Button>
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
      <PageState
        loading={loading}
        error={error}
        empty={!loading && !error && data.length === 0}
        onRetry={() => fetchInquiries(pagination.current, pagination.pageSize, filters)}
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
      >
        <Form form={form} layout="vertical">
          <Form.Item name="status" label="更新状态" rules={[{ required: true }]}>
            <Select>
              <Option value="pending">待处理</Option>
              <Option value="processing">处理中</Option>
              <Option value="completed">已完成</Option>
              <Option value="rejected">已拒绝</Option>
            </Select>
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={4} placeholder="输入处理备注..." />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default Inquiries;
