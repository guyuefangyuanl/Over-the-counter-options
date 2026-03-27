import React, { useCallback, useEffect, useState } from 'react';
import { App, Table, Button, Tag, Modal, Form, Input, Select, Card, Typography, Space, Popconfirm, Row, Col, Statistic, Switch, Tooltip } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, CopyOutlined, EyeOutlined, MessageOutlined, NotificationOutlined, MailOutlined, PhoneOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import PageState from '../components/PageState';

const { Title, Text } = Typography;
const { Option } = Select;
const { TextArea } = Input;

// 消息模板类型
type TemplateCategory = 'inquiry' | 'order' | 'risk' | 'system' | 'marketing';

// 消息模板接口
interface MessageTemplate {
  id: string;
  name: string;
  category: TemplateCategory;
  title: string;
  content: string;
  variables: string[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

// 分类配置
const categoryConfig: Record<TemplateCategory, { color: string; text: string; icon: React.ReactNode }> = {
  inquiry: { color: 'blue', text: '询价通知', icon: <MessageOutlined /> },
  order: { color: 'green', text: '订单通知', icon: <NotificationOutlined /> },
  risk: { color: 'red', text: '风险提醒', icon: <NotificationOutlined /> },
  system: { color: 'purple', text: '系统通知', icon: <MailOutlined /> },
  marketing: { color: 'orange', text: '营销推广', icon: <PhoneOutlined /> },
};

// 本地存储键名
const STORAGE_KEY = 'message_templates';

// 默认模板数据
const defaultTemplates: MessageTemplate[] = [
  {
    id: '1',
    name: '新询价通知',
    category: 'inquiry',
    title: '【期权询价】您有新的询价请求',
    content: '尊敬的{customerName}，您的{productName}期权询价已提交成功，我们的专业团队将在24小时内与您联系。询价编号：{inquiryId}',
    variables: ['customerName', 'productName', 'inquiryId'],
    enabled: true,
    createdAt: '2024-01-01 10:00:00',
    updatedAt: '2024-01-01 10:00:00',
  },
  {
    id: '2',
    name: '订单确认通知',
    category: 'order',
    title: '【订单确认】您的期权订单已确认',
    content: '尊敬的{customerName}，您的{productName}期权订单已确认。订单编号：{orderId}，名义本金：{notional}万元，到期日：{expiryDate}。如有疑问请联系客服。',
    variables: ['customerName', 'productName', 'orderId', 'notional', 'expiryDate'],
    enabled: true,
    createdAt: '2024-01-01 10:00:00',
    updatedAt: '2024-01-01 10:00:00',
  },
  {
    id: '3',
    name: '风险预警通知',
    category: 'risk',
    title: '【风险预警】持仓风险等级变化提醒',
    content: '尊敬的{customerName}，您的{productName}持仓风险等级已变更为{riskLevel}。当前持仓市值：{positionValue}万元，建议您及时关注市场动态并调整投资策略。',
    variables: ['customerName', 'productName', 'riskLevel', 'positionValue'],
    enabled: true,
    createdAt: '2024-01-01 10:00:00',
    updatedAt: '2024-01-01 10:00:00',
  },
  {
    id: '4',
    name: '到期提醒',
    category: 'system',
    title: '【到期提醒】期权即将到期',
    content: '尊敬的{customerName}，您的{productName}期权将于{expiryDate}到期，请提前做好行权或平仓准备。如有疑问请联系您的专属顾问。',
    variables: ['customerName', 'productName', 'expiryDate'],
    enabled: true,
    createdAt: '2024-01-01 10:00:00',
    updatedAt: '2024-01-01 10:00:00',
  },
];

// 从本地存储加载模板
const loadTemplates = (): MessageTemplate[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('加载模板数据失败:', e);
  }
  // 首次加载使用默认模板
  localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultTemplates));
  return defaultTemplates;
};

// 保存模板到本地存储
const saveTemplates = (templates: MessageTemplate[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
};

// 生成唯一ID
const generateId = (): string => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

// 从内容中提取变量
const extractVariables = (content: string): string[] => {
  const matches = content.match(/\{([^}]+)\}/g);
  if (!matches) return [];
  return [...new Set(matches.map(m => m.slice(1, -1)))];
};

const MessageTemplates: React.FC = () => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<MessageTemplate[]>([]);
  const [filterCategory, setFilterCategory] = useState<TemplateCategory | 'all'>('all');
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isPreviewVisible, setIsPreviewVisible] = useState(false);
  const [currentTemplate, setCurrentTemplate] = useState<MessageTemplate | null>(null);
  const [form] = Form.useForm();
  const [previewForm] = Form.useForm();

  // 加载数据
  const fetchTemplates = useCallback(() => {
    setLoading(true);
    setTimeout(() => {
      const templates = loadTemplates();
      setData(templates);
      setLoading(false);
    }, 300);
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  // 过滤数据
  const filteredData = filterCategory === 'all'
    ? data
    : data.filter(t => t.category === filterCategory);

  // 统计信息
  const statistics = {
    total: data.length,
    enabled: data.filter(t => t.enabled).length,
    inquiry: data.filter(t => t.category === 'inquiry').length,
    order: data.filter(t => t.category === 'order').length,
  };

  // 打开创建/编辑模态框
  const handleEdit = (template?: MessageTemplate) => {
    if (template) {
      setCurrentTemplate(template);
      form.setFieldsValue(template);
    } else {
      setCurrentTemplate(null);
      form.resetFields();
      form.setFieldsValue({ enabled: true });
    }
    setIsModalVisible(true);
  };

  // 保存模板
  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
      const variables = extractVariables(values.content);

      if (currentTemplate) {
        // 更新
        const updated = data.map(t =>
          t.id === currentTemplate.id
            ? { ...t, ...values, variables, updatedAt: now }
            : t
        );
        saveTemplates(updated);
        setData(updated);
        message.success('模板更新成功');
      } else {
        // 创建
        const newTemplate: MessageTemplate = {
          id: generateId(),
          ...values,
          variables,
          createdAt: now,
          updatedAt: now,
        };
        const updated = [...data, newTemplate];
        saveTemplates(updated);
        setData(updated);
        message.success('模板创建成功');
      }
      setIsModalVisible(false);
    } catch (err) {
      // 表单验证失败
    }
  };

  // 删除模板
  const handleDelete = (id: string) => {
    const updated = data.filter(t => t.id !== id);
    saveTemplates(updated);
    setData(updated);
    message.success('模板已删除');
  };

  // 切换启用状态
  const handleToggleEnabled = (id: string) => {
    const updated = data.map(t =>
      t.id === id ? { ...t, enabled: !t.enabled, updatedAt: new Date().toISOString().slice(0, 19).replace('T', ' ') } : t
    );
    saveTemplates(updated);
    setData(updated);
    message.success('状态已更新');
  };

  // 复制模板
  const handleCopy = (template: MessageTemplate) => {
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const newTemplate: MessageTemplate = {
      ...template,
      id: generateId(),
      name: `${template.name} (副本)`,
      createdAt: now,
      updatedAt: now,
    };
    const updated = [...data, newTemplate];
    saveTemplates(updated);
    setData(updated);
    message.success('模板已复制');
  };

  // 预览模板
  const handlePreview = (template: MessageTemplate) => {
    setCurrentTemplate(template);
    // 初始化预览表单
    const initialVars: Record<string, string> = {};
    template.variables.forEach(v => {
      initialVars[v] = `{${v}}`;
    });
    previewForm.setFieldsValue(initialVars);
    setIsPreviewVisible(true);
  };

  // 表格列定义
  const columns: ColumnsType<MessageTemplate> = [
    {
      title: '模板名称',
      dataIndex: 'name',
      key: 'name',
      width: 180,
      render: (text, record) => (
        <Space>
          {categoryConfig[record.category].icon}
          <Text strong>{text}</Text>
        </Space>
      ),
    },
    {
      title: '分类',
      dataIndex: 'category',
      key: 'category',
      width: 120,
      render: (category: TemplateCategory) => {
        const config = categoryConfig[category];
        return <Tag color={config.color} icon={config.icon}>{config.text}</Tag>;
      },
    },
    {
      title: '消息标题',
      dataIndex: 'title',
      key: 'title',
      width: 250,
      ellipsis: true,
    },
    {
      title: '消息内容',
      dataIndex: 'content',
      key: 'content',
      ellipsis: true,
      render: (text) => (
        <Tooltip title={text}>
          <Text type="secondary" style={{ maxWidth: 300, display: 'inline-block' }} ellipsis>
            {text}
          </Text>
        </Tooltip>
      ),
    },
    {
      title: '变量',
      dataIndex: 'variables',
      key: 'variables',
      width: 180,
      render: (variables: string[]) => (
        <Space size={4} wrap>
          {variables.map(v => (
            <Tag key={v} style={{ fontSize: 11 }}>{`{${v}}`}</Tag>
          ))}
        </Space>
      ),
    },
    {
      title: '状态',
      dataIndex: 'enabled',
      key: 'enabled',
      width: 100,
      render: (enabled, record) => (
        <Switch
          checked={enabled}
          onChange={() => handleToggleEnabled(record.id)}
          checkedChildren="启用"
          unCheckedChildren="禁用"
        />
      ),
    },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 160,
    },
    {
      title: '操作',
      key: 'action',
      width: 160,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Tooltip title="预览">
            <Button
              type="text"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => handlePreview(record)}
            />
          </Tooltip>
          <Tooltip title="编辑">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleEdit(record)}
            />
          </Tooltip>
          <Tooltip title="复制">
            <Button
              type="text"
              size="small"
              icon={<CopyOutlined />}
              onClick={() => handleCopy(record)}
            />
          </Tooltip>
          <Popconfirm
            title="确定要删除此模板吗？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Tooltip title="删除">
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card>
      {/* 统计卡片 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="模板总数"
              value={statistics.total}
              prefix={<MessageOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="已启用"
              value={statistics.enabled}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="询价通知"
              value={statistics.inquiry}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="订单通知"
              value={statistics.order}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
      </Row>

      {/* 工具栏 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4}>消息模板管理</Title>
        <Space>
          <Select
            value={filterCategory}
            onChange={setFilterCategory}
            style={{ width: 140 }}
          >
            <Option value="all">全部分类</Option>
            {Object.entries(categoryConfig).map(([key, config]) => (
              <Option key={key} value={key}>{config.text}</Option>
            ))}
          </Select>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => handleEdit()}>
            新建模板
          </Button>
        </Space>
      </div>

      {/* 模板列表 */}
      <PageState
        loading={loading}
        empty={!loading && filteredData.length === 0}
      >
        <Table
          columns={columns}
          dataSource={filteredData}
          rowKey="id"
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条`,
          }}
        />
      </PageState>

      {/* 编辑/创建模态框 */}
      <Modal
        title={currentTemplate ? '编辑模板' : '新建模板'}
        open={isModalVisible}
        onOk={handleSave}
        onCancel={() => setIsModalVisible(false)}
        width={700}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="name"
                label="模板名称"
                rules={[{ required: true, message: '请输入模板名称' }]}
              >
                <Input placeholder="如：新询价通知" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="category"
                label="分类"
                rules={[{ required: true, message: '请选择分类' }]}
              >
                <Select placeholder="选择分类">
                  {Object.entries(categoryConfig).map(([key, config]) => (
                    <Option key={key} value={key}>
                      <Space>
                        {config.icon}
                        {config.text}
                      </Space>
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            name="title"
            label="消息标题"
            rules={[{ required: true, message: '请输入消息标题' }]}
          >
            <Input placeholder="如：【期权询价】您有新的询价请求" />
          </Form.Item>
          <Form.Item
            name="content"
            label="消息内容"
            rules={[{ required: true, message: '请输入消息内容' }]}
            extra="使用 {变量名} 格式插入变量，如 {customerName}、{productName}"
          >
            <TextArea
              rows={5}
              placeholder="输入消息内容，使用 {变量名} 表示可替换变量"
            />
          </Form.Item>
          <Form.Item
            name="enabled"
            label="是否启用"
            valuePropName="checked"
          >
            <Switch checkedChildren="启用" unCheckedChildren="禁用" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 预览模态框 */}
      <Modal
        title="模板预览"
        open={isPreviewVisible}
        onCancel={() => setIsPreviewVisible(false)}
        footer={null}
        width={600}
      >
        {currentTemplate && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <Text type="secondary">模板名称：</Text>
              <Text strong>{currentTemplate.name}</Text>
            </div>
            <Card size="small" title="替换变量值" style={{ marginBottom: 16 }}>
              <Form form={previewForm} layout="inline">
                {currentTemplate.variables.map(v => (
                  <Form.Item key={v} name={v} label={v} style={{ marginBottom: 8 }}>
                    <Input style={{ width: 120 }} placeholder={`输入${v}`} />
                  </Form.Item>
                ))}
              </Form>
            </Card>
            <Card size="small" title="预览效果">
              <div style={{ marginBottom: 8 }}>
                <Text strong>标题：</Text>
                <Text>{currentTemplate.title}</Text>
              </div>
              <div>
                <Text strong>内容：</Text>
                <Text>
                  {previewForm.getFieldsValue() && currentTemplate.variables.reduce((text, v) => {
                    const val = previewForm.getFieldValue(v);
                    return text.replace(new RegExp(`\\{${v}\\}`, 'g'), val || `{${v}}`);
                  }, currentTemplate.content)}
                </Text>
              </div>
            </Card>
          </div>
        )}
      </Modal>
    </Card>
  );
};

export default MessageTemplates;