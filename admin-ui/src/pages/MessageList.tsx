import React, { useState, useEffect, useCallback } from 'react';
import { Card, Table, Button, Tag, App, Space, Modal, Form, Input, Select, Typography, Badge, Tabs } from 'antd';
import { ReloadOutlined, PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import api, { getApiErrorMessage, type ApiResponse } from '../utils/api';
import PageState from '../components/PageState';

const { Title, Text } = Typography;
const { TextArea } = Input;

interface Message {
  _id: string;
  type: string;
  title: string;
  content: string;
  targetType: string;
  targetIds: string[];
  status: string;
  readCount: number;
  totalCount: number;
  createdAt: string;
}

interface MessageTemplate {
  _id: string;
  name: string;
  type: string;
  title: string;
  content: string;
  variables: string[];
  createdAt: string;
}

interface PaginatedPayload<T> {
  items: T[];
  pagination: {
    page: number;
    per_page: number;
    total: number;
  };
}

const MessageList: React.FC = () => {
  const { message } = App.useApp();
  const [activeTab, setActiveTab] = useState('messages');
  
  // 消息列表状态
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Message[]>([]);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | undefined>();
  
  // 模板列表状态
  const [templateLoading, setTemplateLoading] = useState(false);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [templateError, setTemplateError] = useState<string | null>(null);
  
  // 模态框
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [form] = Form.useForm();
  
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [templateModalLoading, setTemplateModalLoading] = useState(false);
  const [templateForm] = Form.useForm();

  // 获取消息列表
  const fetchMessages = useCallback(async (page = 1, pageSize = 10, msgType?: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<ApiResponse<PaginatedPayload<Message>>>('/admin/messages', {
        params: { page, pageSize, type: msgType },
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
      const msg = getApiErrorMessage(err, '获取消息列表失败');
      setError(msg);
      message.error(msg);
    } finally {
      setLoading(false);
    }
  }, [message]);

  // 获取模板列表
  const fetchTemplates = useCallback(async () => {
    setTemplateLoading(true);
    setTemplateError(null);
    try {
      const res = await api.get<ApiResponse<{ items: MessageTemplate[] }>>('/admin/message-templates');
      if (res.success && res.data?.items) {
        setTemplates(res.data.items);
      }
    } catch (err) {
      const msg = getApiErrorMessage(err, '获取模板列表失败');
      setTemplateError(msg);
      message.error(msg);
    } finally {
      setTemplateLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void fetchMessages();
    void fetchTemplates();
  }, [fetchMessages, fetchTemplates]);

  // 发送消息
  const openModal = () => {
    form.resetFields();
    form.setFieldsValue({ type: 'system', targetType: 'all' });
    setIsModalOpen(true);
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      setModalLoading(true);
      
      await api.post('/admin/messages', values);
      message.success('消息创建成功');
      setIsModalOpen(false);
      void fetchMessages(pagination.current, pagination.pageSize, typeFilter);
    } catch (err) {
      if (err instanceof Error && err.name === 'ValidationError') {
        return;
      }
      message.error(getApiErrorMessage(err, '创建失败'));
    } finally {
      setModalLoading(false);
    }
  };

  // 创建模板
  const openTemplateModal = () => {
    templateForm.resetFields();
    templateForm.setFieldsValue({ type: 'system', variables: [] });
    setIsTemplateModalOpen(true);
  };

  const handleTemplateModalOk = async () => {
    try {
      const values = await templateForm.validateFields();
      setTemplateModalLoading(true);
      
      await api.post('/admin/message-templates', values);
      message.success('模板创建成功');
      setIsTemplateModalOpen(false);
      void fetchTemplates();
    } catch (err) {
      if (err instanceof Error && err.name === 'ValidationError') {
        return;
      }
      message.error(getApiErrorMessage(err, '创建失败'));
    } finally {
      setTemplateModalLoading(false);
    }
  };

  // 消息表格列
  const columns: ColumnsType<Message> = [
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 100,
      render: (type) => {
        const colorMap: Record<string, string> = {
          system: 'blue',
          notice: 'green',
          promotion: 'orange',
          warning: 'red',
        };
        const labelMap: Record<string, string> = {
          system: '系统',
          notice: '通知',
          promotion: '推广',
          warning: '警告',
        };
        return <Tag color={colorMap[type] || 'default'}>{labelMap[type] || type}</Tag>;
      },
    },
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      width: 200,
      ellipsis: true,
    },
    {
      title: '内容',
      dataIndex: 'content',
      key: 'content',
      ellipsis: true,
      render: (val) => (
        <Text style={{ maxWidth: 300 }} ellipsis={{ tooltip: val }}>{val}</Text>
      ),
    },
    {
      title: '发送目标',
      dataIndex: 'targetType',
      key: 'targetType',
      width: 100,
      render: (targetType) => {
        const labelMap: Record<string, string> = {
          all: '全部用户',
          group: '分组用户',
          user: '指定用户',
        };
        return labelMap[targetType] || targetType;
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status) => {
        const statusMap: Record<string, { status: 'success' | 'processing' | 'error' | 'default'; text: string }> = {
          pending: { status: 'default', text: '待发送' },
          sending: { status: 'processing', text: '发送中' },
          sent: { status: 'success', text: '已发送' },
          failed: { status: 'error', text: '发送失败' },
        };
        const config = statusMap[status] || { status: 'default', text: status };
        return <Badge {...config} />;
      },
    },
    {
      title: '阅读情况',
      key: 'readStats',
      width: 120,
      render: (_, record) => (
        <Text>
          {record.readCount} / {record.totalCount || '-'}
        </Text>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 160,
      render: (val) => val ? new Date(val).toLocaleString() : '-',
    },
  ];

  // 模板表格列
  const templateColumns: ColumnsType<MessageTemplate> = [
    {
      title: '模板名称',
      dataIndex: 'name',
      key: 'name',
      width: 150,
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 100,
      render: (type) => {
        const labelMap: Record<string, string> = {
          system: '系统',
          notice: '通知',
          promotion: '推广',
        };
        return <Tag>{labelMap[type] || type}</Tag>;
      },
    },
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      width: 200,
      ellipsis: true,
    },
    {
      title: '内容',
      dataIndex: 'content',
      key: 'content',
      ellipsis: true,
      render: (val) => (
        <Text style={{ maxWidth: 300 }} ellipsis={{ tooltip: val }}>{val}</Text>
      ),
    },
    {
      title: '变量',
      dataIndex: 'variables',
      key: 'variables',
      width: 150,
      render: (vars) => (
        vars?.length > 0 ? (
          <Space size={4} wrap>
            {vars.map((v: string) => <Tag key={v} color="blue">{`{{${v}}}`}</Tag>)}
          </Space>
        ) : '-'
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 160,
      render: (val) => val ? new Date(val).toLocaleString() : '-',
    },
  ];

  const tabItems = [
    {
      key: 'messages',
      label: '消息列表',
      children: (
        <>
          <div style={{ marginBottom: 16, display: 'flex', gap: 16 }}>
            <Select
              placeholder="消息类型"
              style={{ width: 120 }}
              allowClear
              value={typeFilter}
              onChange={(val) => {
                setTypeFilter(val);
                void fetchMessages(1, pagination.pageSize, val);
              }}
            >
              <Select.Option value="system">系统</Select.Option>
              <Select.Option value="notice">通知</Select.Option>
              <Select.Option value="promotion">推广</Select.Option>
              <Select.Option value="warning">警告</Select.Option>
            </Select>
          </div>
          <PageState
            loading={loading}
            error={error}
            empty={!loading && !error && data.length === 0}
            onRetry={() => fetchMessages(pagination.current, pagination.pageSize, typeFilter)}
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
                  void fetchMessages(page, pageSize, typeFilter);
                },
              }}
            />
          </PageState>
        </>
      ),
    },
    {
      key: 'templates',
      label: '消息模板',
      children: (
        <PageState
          loading={templateLoading}
          error={templateError}
          empty={!templateLoading && !templateError && templates.length === 0}
          onRetry={fetchTemplates}
        >
          <Table
            columns={templateColumns}
            dataSource={templates}
            rowKey="_id"
            pagination={false}
          />
        </PageState>
      ),
    },
  ];

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>消息管理</Title>
        <Space>
          {activeTab === 'messages' && (
            <Button type="primary" icon={<PlusOutlined />} onClick={openModal}>
              发送消息
            </Button>
          )}
          {activeTab === 'templates' && (
            <Button type="primary" icon={<PlusOutlined />} onClick={openTemplateModal}>
              新建模板
            </Button>
          )}
          <Button icon={<ReloadOutlined />} onClick={() => {
            if (activeTab === 'messages') {
              void fetchMessages(pagination.current, pagination.pageSize, typeFilter);
            } else {
              void fetchTemplates();
            }
          }}>
            刷新
          </Button>
        </Space>
      </div>

      <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />

      {/* 发送消息模态框 */}
      <Modal
        title="发送消息"
        open={isModalOpen}
        onOk={handleModalOk}
        onCancel={() => setIsModalOpen(false)}
        confirmLoading={modalLoading}
        width={600}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="type" label="消息类型" rules={[{ required: true }]}>
            <Select>
              <Select.Option value="system">系统消息</Select.Option>
              <Select.Option value="notice">通知</Select.Option>
              <Select.Option value="promotion">推广</Select.Option>
              <Select.Option value="warning">警告</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }]}>
            <Input placeholder="请输入消息标题" maxLength={100} />
          </Form.Item>
          <Form.Item name="content" label="内容" rules={[{ required: true, message: '请输入内容' }]}>
            <TextArea placeholder="请输入消息内容" rows={4} maxLength={500} showCount />
          </Form.Item>
          <Form.Item name="targetType" label="发送目标" rules={[{ required: true }]}>
            <Select>
              <Select.Option value="all">全部用户</Select.Option>
              <Select.Option value="group">分组用户</Select.Option>
              <Select.Option value="user">指定用户</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      {/* 创建模板模态框 */}
      <Modal
        title="新建消息模板"
        open={isTemplateModalOpen}
        onOk={handleTemplateModalOk}
        onCancel={() => setIsTemplateModalOpen(false)}
        confirmLoading={templateModalLoading}
        width={600}
      >
        <Form form={templateForm} layout="vertical">
          <Form.Item name="name" label="模板名称" rules={[{ required: true, message: '请输入模板名称' }]}>
            <Input placeholder="请输入模板名称" maxLength={50} />
          </Form.Item>
          <Form.Item name="type" label="消息类型" rules={[{ required: true }]}>
            <Select>
              <Select.Option value="system">系统消息</Select.Option>
              <Select.Option value="notice">通知</Select.Option>
              <Select.Option value="promotion">推广</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="title" label="标题模板" rules={[{ required: true, message: '请输入标题模板' }]}>
            <Input placeholder="如：订单通知 - {{orderNo}}" maxLength={100} />
          </Form.Item>
          <Form.Item name="content" label="内容模板" rules={[{ required: true, message: '请输入内容模板' }]}>
            <TextArea 
              placeholder="使用 {{变量名}} 插入变量，如：尊敬的{{username}}，您的订单已发货。" 
              rows={4} 
              maxLength={500} 
              showCount 
            />
          </Form.Item>
          <Form.Item name="variables" label="模板变量">
            <Select
              mode="tags"
              placeholder="输入变量名后按回车添加"
              style={{ width: '100%' }}
            />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default MessageList;