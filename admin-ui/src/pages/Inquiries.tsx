import React, { useState, useEffect } from 'react';
import { Table, Button, Tag, Modal, Form, Input, Select, message, Card, Typography } from 'antd';
import { ReloadOutlined, EditOutlined } from '@ant-design/icons';
import api from '../utils/api';
import type { ColumnsType } from 'antd/es/table';

const { Title } = Typography;
const { Option } = Select;

interface Inquiry {
  _id: string;
  selectedProduct: any;
  quantity: number;
  contactName: string;
  phone: string;
  status: 'pending' | 'processing' | 'completed' | 'rejected';
  createdAt: string;
  remark?: string;
}

const Inquiries: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Inquiry[]>([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [currentInquiry, setCurrentInquiry] = useState<Inquiry | null>(null);
  const [form] = Form.useForm();

  const fetchInquiries = async () => {
    setLoading(true);
    try {
      const res: any = await api.get('/inquiry/admin/inquiries');
      if (res.success) {
        setData(res.data);
      }
    } catch (error) {
      message.error('获取询价列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInquiries();
  }, []);

  const handleUpdateStatus = (inquiry: Inquiry) => {
    setCurrentInquiry(inquiry);
    form.setFieldsValue({
      status: inquiry.status,
      remark: inquiry.remark,
    });
    setIsModalVisible(true);
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      if (!currentInquiry) return;

      const res: any = await api.put(`/inquiry/admin/inquiries/${currentInquiry._id}/status`, values);
      if (res.success) {
        message.success('更新成功');
        setIsModalVisible(false);
        fetchInquiries();
      }
    } catch (error) {
      message.error('更新失败');
    }
  };

  const getStatusTag = (status: string) => {
    const statusMap: any = {
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
