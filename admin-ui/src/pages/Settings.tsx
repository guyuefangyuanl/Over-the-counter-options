import React from 'react';
import { App, Card, Typography, Form, Input, Button, Switch, Divider } from 'antd';

const { Title } = Typography;

const Settings: React.FC = () => {
  const { message } = App.useApp();
  const [form] = Form.useForm();

  const onFinish = (values: Record<string, unknown>) => {
    void values;
    message.warning('当前为演示模式：设置不会保存到服务器');
  };

  return (
    <Card>
      <Title level={4}>系统设置</Title>
      <Form
        form={form}
        layout="vertical"
        onFinish={onFinish}
        initialValues={{
          siteName: 'OTC 场外期权管理系统',
          enableRegistration: true,
          maintenanceMode: false,
        }}
      >
        <Form.Item name="siteName" label="系统名称">
          <Input />
        </Form.Item>
        <Form.Item name="enableRegistration" label="开放注册" valuePropName="checked">
          <Switch />
        </Form.Item>
        <Form.Item name="maintenanceMode" label="维护模式" valuePropName="checked">
          <Switch />
        </Form.Item>
        <Divider />
        <Form.Item>
          <Button type="primary" htmlType="submit">
            保存设置
          </Button>
        </Form.Item>
      </Form>
    </Card>
  );
};

export default Settings;
