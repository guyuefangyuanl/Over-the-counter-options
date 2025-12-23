import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Statistic, Typography, List, Tag, message } from 'antd';
import {
  StockOutlined,
  SolutionOutlined,
  BellOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import api from '../utils/api';

const { Title } = Typography;

interface Stats {
  stockCount: number;
  inquiryCount: number;
  pendingInquiryCount: number;
  orderCount: number;
}

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<Stats>({
    stockCount: 0,
    inquiryCount: 0,
    pendingInquiryCount: 0,
    orderCount: 0,
  });

  const fetchStats = async () => {
    try {
      const res: any = await api.get('/admin/stats');
      if (res.success) {
        setStats(res.data);
      }
    } catch (error) {
      message.error('获取统计数据失败');
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  return (
    <div>
      <Title level={3}>工作台</Title>
      <Row gutter={16}>
        <Col span={6}>
          <Card bordered={false}>
            <Statistic
              title="行情总数"
              value={stats.stockCount}
              prefix={<StockOutlined />}
              valueStyle={{ color: '#3f8600' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card bordered={false}>
            <Statistic
              title="询价总数"
              value={stats.inquiryCount}
              prefix={<SolutionOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card bordered={false}>
            <Statistic
              title="待处理询价"
              value={stats.pendingInquiryCount}
              prefix={<BellOutlined />}
              valueStyle={{ color: '#cf1322' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card bordered={false}>
            <Statistic
              title="成交订单"
              value={stats.orderCount}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginTop: 24 }}>
        <Col span={16}>
          <Card title="最近动态" bordered={false}>
            <List
              itemLayout="horizontal"
              dataSource={[
                { title: '系统部署成功', time: '2025-12-23', type: 'info' },
                { title: '完成云开发环境初始化', time: '2025-12-23', type: 'success' },
              ]}
              renderItem={(item) => (
                <List.Item>
                  <List.Item.Meta
                    title={item.title}
                    description={`时间: ${item.time}`}
                  />
                  <Tag color={item.type === 'success' ? 'green' : 'blue'}>
                    {item.type.toUpperCase()}
                  </Tag>
                </List.Item>
              )}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card title="系统通知" bordered={false}>
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
