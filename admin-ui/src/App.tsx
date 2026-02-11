import { BrowserRouter, Routes, Route } from 'react-router-dom';
import AdminLayout from './components/AdminLayout';
import AuthGuard from './components/AuthGuard';
import Dashboard from './pages/Dashboard';
import Quotes from './pages/Quotes';
import QuotesHistory from './pages/QuotesHistory';
import Inquiries from './pages/Inquiries';
import Orders from './pages/Orders';
import Login from './pages/Login';
import Users from './pages/Users';
import Settings from './pages/Settings';
import FeeList from './pages/FeeList';
import FeeStatistics from './pages/FeeStatistics';
import CustomerList from './pages/CustomerList';
import BoardList from './pages/BoardList';

function App() {
  return (
    <BrowserRouter basename="/">
      <Routes>
        <Route path="login" element={<Login />} />
        <Route path="admin/login" element={<Login />} />
        <Route path="/" element={<AuthGuard><AdminLayout /></AuthGuard>}>
          <Route index element={<Dashboard />} />
          {/* 费用管理 */}
          <Route path="fee/list" element={<FeeList />} />
          <Route path="fee/statistics" element={<FeeStatistics />} />
          {/* 客户管理 */}
          <Route path="customer/list" element={<CustomerList />} />
          <Route path="customer/groups" element={<CustomerGroups />} />
          {/* 行情管理 */}
          <Route path="quotes" element={<Quotes />} />
          <Route path="quotes/history" element={<QuotesHistory />} />
          <Route path="quotes/boards" element={<BoardList />} />
          {/* 交易管理 */}
          <Route path="trade/orders" element={<TradeOrders />} />
          <Route path="trade/inquiries" element={<TradeInquiries />} />
          <Route path="trade/positions" element={<TradePositions />} />
          {/* 消息管理 */}
          <Route path="message/list" element={<MessageList />} />
          <Route path="message/templates" element={<MessageTemplates />} />
          {/* 配置管理 */}
          <Route path="config/system" element={<ConfigSystem />} />
          <Route path="config/users" element={<ConfigUsers />} />
          {/* 旧路由兼容 */}
          <Route path="inquiries" element={<Inquiries />} />
          <Route path="orders" element={<Orders />} />
          <Route path="users" element={<Users />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
