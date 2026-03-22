import React, { useState, useEffect, useCallback } from 'react';
import { Card, Table, Button, Tag, App, Space, Modal, Form, Input, InputNumber, Select } from 'antd';
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

interface Customer {
  _id: string;
  name: string;
  phone: string;
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

const feeTypeOptions = [
  { label: '期权费', value: 'option_fee' },
  { label: '手续费', value: 'commission' },
  { label: '保证金', value: 'margin' },
  { label: '服务费', value: 'service_fee' },
  { label: '其他', value: 'other' },
];

const FeeList: React.FC = () => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Fee[]>([]);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 });
  const [error, setError] = useState<string | null>(null);
  
  // 模态框状态
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [form] = Form.useForm();
  const [customers, setCustomers] = useState<Customer[]>([]);

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

  // 获取客户列表用于下拉选择
  const fetchCustomers = useCallback(async () => {
    try {
      const res = await api.get<ApiResponse<PaginatedPayload<Customer>>>('/admin/customers', {
        params: { page: 1, pageSize: 100 },
      });
      if (res.success && res.data?.items) {
        setCustomers(res.data.items);
      }
    } catch (err) {
      console.error('获取客户列表失败:', err);
    }
  }, []);

  useEffect(() => {
    void fetchFees();
  }, [fetchFees]);

  // 打开新增费用模态框
  const openCreateModal = () => {
    form.resetFields();
    form.setFieldsValue({ feeType: 'option_fee', status: 'pending' });
    void fetchCustomers();
    setIsModalOpen(true);
  };

  // 提交新增费用
  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      setModalLoading(true);

      const selectedCustomer = customers.find(c => c._id === values.customerId);

      const res = await api.post<ApiResponse<{ _id: string }>>('/admin/fees', {
        ...values,
        customerName: selectedCustomer?.name || '',
      });

      if (res.success) {
        message.success('费用创建成功');
        setIsModalOpen(false);
        void fetchFees(pagination.current, pagination.pageSize);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'ValidationError') {
        return;
      }
      message.error(getApiErrorMessage(err, '创建费用失败'));
    } finally {
      setModalLoading(false);
    }
  };

  const columns: ColumnsType<Fee> = [
    {
      title: '费用类型',
      dataIndex: 'feeType',
      key: 'feeType',
      render: (type) => {
        const item = feeTypeOptions.find(o => o.value === type);
        return item?.label || type;
      },
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
      render: (val) => `¥${Number(val).toLocaleString()}`,
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
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (val) => val || '-',
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (val) => val ? new Date(val).toLocaleString() : '-',
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
        <h2 style={{ margin: 0 }}>费用列表</h2>
        <Space>
          <Button icon={<PlusOutlined />} type="primary" onClick={openCreateModal}>新增费用</Button>
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

      {/* 新增费用模态框 */}
      <Modal
        title="新增费用"
        open={isModalOpen}
        onOk={handleModalOk}
        onCancel={() => setIsModalOpen(false)}
        confirmLoading={modalLoading}
        width={500}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ feeType: 'option_fee', status: 'pending' }}
        >
          <Form.Item
            name="feeType"
            label="费用类型"
            rules={[{ required: true, message: '请选择费用类型' }]}
          >
            <Select options={feeTypeOptions} placeholder="请选择费用类型" />
          </Form.Item>
          <Form.Item
            name="customerId"
            label="客户"
            rules={[{ required: true, message: '请选择客户' }]}
          >
            <Select
              placeholder="请选择客户"
              showSearch
              optionFilterProp="children"
              filterOption={(input, option) =>
                (option?.children as unknown as string)?.toLowerCase().includes(input.toLowerCase())
              }
            >
              {customers.map(c => (
                <Select.Option key={c._id} value={c._id}>
                  {c.name} ({c.phone})
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            name="amount"
            label="金额"
            rules={[{ required: true, message: '请输入金额' }]}
          >
            <InputNumber
              style={{ width: '100%' }}
              min={0}
              precision={2}
              placeholder="请输入金额"
              prefix="¥"
            />
          </Form.Item>
          <Form.Item
            name="status"
            label="状态"
            rules={[{ required: true, message: '请选择状态' }]}
          >
            <Select>
              <Select.Option value="pending">待支付</Select.Option>
              <Select.Option value="paid">已支付</Select.Option>
              <Select.Option value="cancelled">已取消</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} placeholder="请输入费用描述（选填）" />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default FeeList;
