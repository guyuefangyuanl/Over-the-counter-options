import React, { useState, useEffect, useCallback } from 'react';
import { Card, Row, Col, Statistic, Empty, App, Button, Spin, Typography } from 'antd';
import { DollarOutlined, RiseOutlined, ReloadOutlined, CheckCircleOutlined, ClockCircleOutlined } from '@ant-design/icons';
import api, { getApiErrorMessage, type ApiResponse } from '../utils/api';

const { Title, Text } = Typography;

interface FeeStats {
  totalFees: number;
  paidFees: number;
  pendingFees: number;
  monthlyFees: number;
  totalAmount: number;
  paidAmount: number;
  pendingAmount: number;
  monthlyAmount: number;
}

const FeeStatistics: React.FC = () => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<FeeStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<ApiResponse<FeeStats>>('/admin/fees/statistics');
      if (res.success && res.data) {
        setStats(res.data);
      }
    } catch (err) {
      const msg = getApiErrorMessage(err, '获取统计数据失败');
      setError(msg);
      message.error(msg);
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0 }}>费用统计</Title>
        <Button icon={<ReloadOutlined />} onClick={fetchStats} loading={loading}>
          刷新
        </Button>
      </div>

      <Spin spinning={loading}>
        {error ? (
          <Card>
            <Empty description={error}>
              <Button type="primary" onClick={fetchStats}>重试</Button>
            </Empty>
          </Card>
        ) : (
          <>
            <Row gutter={16}>
              <Col span={6}>
                <Card>
                  <Statistic
                    title="总费用笔数"
                    value={stats?.totalFees || 0}
                    suffix="笔"
                    prefix={<DollarOutlined />}
                  />
                </Card>
              </Col>
              <Col span={6}>
                <Card>
                  <Statistic
                    title="总金额"
                    value={stats?.totalAmount || 0}
                    precision={2}
                    prefix="¥"
                    valueStyle={{ color: '#1677ff' }}
                  />
                </Card>
              </Col>
              <Col span={6}>
                <Card>
                  <Statistic
                    title="已收金额"
                    value={stats?.paidAmount || 0}
                    precision={2}
                    prefix="¥"
                    valueStyle={{ color: '#3f8600' }}
                  />
                </Card>
              </Col>
              <Col span={6}>
                <Card>
                  <Statistic
                    title="待收金额"
                    value={stats?.pendingAmount || 0}
                    precision={2}
                    prefix="¥"
                    valueStyle={{ color: '#cf1322' }}
                  />
                </Card>
              </Col>
            </Row>

            <Row gutter={16} style={{ marginTop: 16 }}>
              <Col span={8}>
                <Card>
                  <Statistic
                    title="本月收入"
                    value={stats?.monthlyAmount || 0}
                    precision={2}
                    prefix={<RiseOutlined />}
                    suffix="元"
                    valueStyle={{ color: '#3f8600' }}
                  />
                </Card>
              </Col>
              <Col span={8}>
                <Card>
                  <Statistic
                    title="已支付笔数"
                    value={stats?.paidFees || 0}
                    suffix="笔"
                    prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
                  />
                </Card>
              </Col>
              <Col span={8}>
                <Card>
                  <Statistic
                    title="待支付笔数"
                    value={stats?.pendingFees || 0}
                    suffix="笔"
                    prefix={<ClockCircleOutlined style={{ color: '#faad14' }} />}
                  />
                </Card>
              </Col>
            </Row>

            <Card style={{ marginTop: 24 }}>
              <Empty description="统计图表即将推出">
                <Text type="secondary">后续版本将支持费用趋势图、分类占比图等可视化分析</Text>
              </Empty>
            </Card>
          </>
        )}
      </Spin>
    </div>
  );
};

export default FeeStatistics;
