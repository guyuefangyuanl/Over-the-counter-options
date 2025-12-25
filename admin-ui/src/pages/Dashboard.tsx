import React, { useCallback, useEffect, useState } from 'react';
import { App, Card, Row, Col, Statistic, Typography, Tag } from 'antd';
import {
  StockOutlined,
  SolutionOutlined,
  BellOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import api, { getApiErrorMessage, type ApiResponse } from '../utils/api';

const { Title } = Typography;

interface Stats {
  stockCount: number;
  inquiryCount: number;
  pendingInquiryCount: number;
  orderCount: number;
}

const Dashboard: React.FC = () => {
  const { message } = App.useApp();
  const [stats, setStats] = useState<Stats>({
    stockCount: 0,
    inquiryCount: 0,
    pendingInquiryCount: 0,
    orderCount: 0,
  });

  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get<ApiResponse<Stats>>('/admin/stats');
      if (res.success && res.data) {
        setStats(res.data);
      }
    } catch (err) {
      message.error(getApiErrorMessage(err, '获取统计数据失败'));
    }
  }, [message]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchStats();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [fetchStats]);

  return (
    <div>
      <Title level={3}>工作台</Title>
      <Row gutter={16}>
        <Col span={6}>
          <Card variant="borderless">
            <Statistic
              title="行情总数"
              value={stats.stockCount}
              prefix={<StockOutlined />}
              styles={{ content: { color: '#3f8600' } }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card variant="borderless">
            <Statistic
              title="询价总数"
              value={stats.inquiryCount}
              prefix={<SolutionOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card variant="borderless">
            <Statistic
              title="待处理询价"
              value={stats.pendingInquiryCount}
              prefix={<BellOutlined />}
              styles={{ content: { color: '#cf1322' } }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card variant="borderless">
            <Statistic
              title="成交订单"
              value={stats.orderCount}
              prefix={<CheckCircleOutlined />}
              styles={{ content: { color: '#1890ff' } }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginTop: 24 }}>
        <Col span={16}>
          <Card title="最近动态" variant="borderless">
            {[
              { title: '系统部署成功', time: '2025-12-23', type: 'info' },
              { title: '完成云开发环境初始化', time: '2025-12-23', type: 'success' },
            ].map((item) => (
              <div
                key={`${item.title}-${item.time}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 0',
                  borderBottom: '1px solid rgba(5, 5, 5, 0.06)',
                }}
              >
                <div>
                  <div style={{ fontWeight: 500 }}>{item.title}</div>
                  <div style={{ color: 'rgba(0, 0, 0, 0.45)', fontSize: 12 }}>{`时间: ${item.time}`}</div>
                </div>
                <Tag color={item.type === 'success' ? 'green' : 'blue'}>
                  {item.type.toUpperCase()}
                </Tag>
              </div>
            ))}
          </Card>
        </Col>
        <Col span={8}>
          <Card title="系统通知" variant="borderless">
            <p>欢迎使用 OTC 场外期权管理系统后台。</p>
            <p>当前环境：微信云托管 (Production)</p>
            <p>版本：v1.0.0</p>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Dashboard;
