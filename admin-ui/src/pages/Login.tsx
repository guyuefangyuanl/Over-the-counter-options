import React, { useCallback, useState } from 'react';
import { App, Button, Card, Form, Input, Typography } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';
import api, { getApiErrorMessage, type ApiResponse } from '../utils/api';

const { Title } = Typography;

type LoginFormValues = {
  username: string;
  password: string;
};

type LoginResponse = {
  token: string;
  tokenType: string;
  expiresIn: number;
};

const Login: React.FC = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fromPathname =
    (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || '/';

  const onFinish = useCallback(
    async (values: LoginFormValues) => {
      setIsSubmitting(true);
      try {
        const res = await api.post<ApiResponse<LoginResponse>>('/auth/login', values);
        if (res.success && res.data?.token) {
          localStorage.setItem('admin_token', res.data.token);
          message.success('登录成功');
          navigate(fromPathname, { replace: true });
          return;
        }
        message.error(res.message || '登录失败');
      } catch (err) {
        message.error(getApiErrorMessage(err, '登录失败'));
      } finally {
        setIsSubmitting(false);
      }
    },
    [fromPathname, message, navigate]
  );

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Card style={{ width: 420 }}>
        <Title level={4} style={{ marginTop: 0 }}>后台登录</Title>
        <Form<LoginFormValues> layout="vertical" onFinish={onFinish} autoComplete="off">
          <Form.Item<LoginFormValues>
            label="用户名"
            name="username"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input placeholder="admin" />
          </Form.Item>
          <Form.Item<LoginFormValues>
            label="密码"
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password placeholder="请输入密码" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={isSubmitting}>
            登录
          </Button>
        </Form>
      </Card>
    </div>
  );
};

export default Login;
