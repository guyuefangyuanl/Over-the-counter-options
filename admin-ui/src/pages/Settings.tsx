import React, { useState, useEffect, useCallback } from 'react';
import { App, Card, Typography, Form, Input, Button, Switch, Divider, Spin, Space, Popconfirm } from 'antd';
import { SaveOutlined, ReloadOutlined } from '@ant-design/icons';
import api, { getApiErrorMessage, type ApiResponse } from '../utils/api';

const { Title, Text } = Typography;

interface SystemConfig {
  _id: string;
  key: string;
  value: string;
  category: string;
  description?: string;
  updatedAt?: string;
}

const Settings: React.FC = () => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [configs, setConfigs] = useState<SystemConfig[]>([]);

  // 获取系统配置
  const fetchConfigs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<ApiResponse<{ items: SystemConfig[] }>>('/admin/configs', {
        params: { category: 'system' },
      });
      if (res.success && res.data?.items) {
        setConfigs(res.data.items);
        // 设置表单值
        const formValues: Record<string, string | boolean> = {};
        res.data.items.forEach((cfg) => {
          // 尝试解析布尔值
          if (cfg.value === 'true' || cfg.value === 'false') {
            formValues[cfg.key] = cfg.value === 'true';
          } else {
            formValues[cfg.key] = cfg.value;
          }
        });
        form.setFieldsValue(formValues);
      }
    } catch (err) {
      // 如果获取失败，使用默认值
      console.error('获取配置失败:', err);
      form.setFieldsValue({
        siteName: 'OTC 场外期权管理系统',
        enableRegistration: true,
        maintenanceMode: false,
      });
    } finally {
      setLoading(false);
    }
  }, [form]);

  useEffect(() => {
    void fetchConfigs();
  }, [fetchConfigs]);

  // 保存配置
  const onFinish = async (values: Record<string, unknown>) => {
    setSaving(true);
    try {
      // 更新或创建每个配置项
      const updatePromises = Object.entries(values).map(async ([key, val]) => {
        const configValue = typeof val === 'boolean' ? String(val) : String(val ?? '');
        // 查找现有配置
        const existingConfig = configs.find((c) => c.key === key);
        
        if (existingConfig) {
          // 更新现有配置
          return api.put(`/admin/configs/${existingConfig._id}`, { value: configValue });
        } else {
          // 创建新配置
          return api.post('/admin/configs', {
            key,
            value: configValue,
            category: 'system',
          });
        }
      });

      await Promise.all(updatePromises);
      message.success('设置保存成功');
      void fetchConfigs();
    } catch (err) {
      message.error(getApiErrorMessage(err, '保存设置失败'));
    } finally {
      setSaving(false);
    }
  };

  const onReset = () => {
    form.resetFields();
    void fetchConfigs();
  };

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>系统设置</Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchConfigs} loading={loading}>
            刷新
          </Button>
          <Popconfirm
            title="确定要重置所有设置吗？"
            onConfirm={onReset}
            okText="确定"
            cancelText="取消"
          >
            <Button>重置</Button>
          </Popconfirm>
        </Space>
      </div>

      <Spin spinning={loading}>
        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
          initialValues={{
            siteName: 'OTC 场外期权管理系统',
            enableRegistration: true,
            maintenanceMode: false,
          }}
          style={{ maxWidth: 600 }}
        >
          <Form.Item name="siteName" label="系统名称">
            <Input placeholder="请输入系统名称" />
          </Form.Item>
          <Form.Item name="enableRegistration" label="开放注册" valuePropName="checked" extra="允许用户自主注册账号">
            <Switch checkedChildren="开启" unCheckedChildren="关闭" />
          </Form.Item>
          <Form.Item name="maintenanceMode" label="维护模式" valuePropName="checked" extra="开启后，前端将显示维护提示">
            <Switch checkedChildren="开启" unCheckedChildren="关闭" />
          </Form.Item>
          <Divider />
          <Form.Item>
            <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>
              保存设置
            </Button>
          </Form.Item>
        </Form>

        {configs.length > 0 && (
          <div style={{ marginTop: 24, padding: 16, background: '#fafafa', borderRadius: 8 }}>
            <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
              配置更新时间：{configs[0]?.updatedAt ? new Date(configs[0].updatedAt).toLocaleString() : '-'}
            </Text>
            <Text type="secondary">
              共 {configs.length} 项系统配置
            </Text>
          </div>
        )}
      </Spin>
    </Card>
  );
};

export default Settings;
