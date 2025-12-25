import React, { useCallback, useEffect, useState } from 'react';
import { App, Table, Button, Tag, Modal, Form, Input, Select, Card, Typography } from 'antd';
import { ReloadOutlined, EditOutlined } from '@ant-design/icons';
import api, { getApiErrorMessage, type ApiResponse } from '../utils/api';
import type { ColumnsType } from 'antd/es/table';

const { Title } = Typography;
const { Option } = Select;

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

const Inquiries: React.FC = () => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Inquiry[]>([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [currentInquiry, setCurrentInquiry] = useState<Inquiry | null>(null);
  const [form] = Form.useForm();

  const fetchInquiries = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<ApiResponse<Inquiry[]>>('/admin/inquiries');
      if (res.success && Array.isArray(res.data)) {
        setData(res.data);
      }
    } catch (err) {
      message.error(getApiErrorMessage(err, '获取询价列表失败'));
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void fetchInquiries();
  }, [fetchInquiries]);

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
        void fetchInquiries();
      }
    } catch (err) {
      message.error(getApiErrorMessage(err, '更新失败'));
    }
  };

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
          <div style={{ fontSize: '12px', color: '#666' }}>{record.phone}</div>
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
        <Button icon={<ReloadOutlined />} onClick={fetchInquiries}>
          刷新
        </Button>
      </div>
      <Table
        columns={columns}
        dataSource={data}
        rowKey="_id"
        loading={loading}
      />

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
