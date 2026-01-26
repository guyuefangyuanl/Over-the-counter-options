import React from 'react';
import { Card, Row, Col, Statistic, Empty } from 'antd';
import { DollarOutlined, RiseOutlined, FallOutlined } from '@ant-design/icons';

const FeeStatistics: React.FC = () => {
  return (
    <div>
      <h2 style={{ marginBottom: 24 }}>费用统计</h2>
      <Row gutter={16}>
        <Col span={8}>
          <Card>
            <Statistic
              title="总收费"
              value={0}
              precision={2}
              prefix={<DollarOutlined />}
              suffix="元"
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="本月收费"
              value={0}
              precision={2}
              prefix={<RiseOutlined />}
              suffix="元"
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="待收款"
              value={0}
              precision={2}
              prefix={<FallOutlined />}
              suffix="元"
            />
          </Card>
        </Col>
      </Row>
      <Card style={{ marginTop: 24 }}>
        <Empty description="统计图表即将推出" />
      </Card>
    </div>
  );
};

export default FeeStatistics;
