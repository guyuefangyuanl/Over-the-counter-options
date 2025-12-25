import { BrowserRouter, Routes, Route } from 'react-router-dom';
import AdminLayout from './components/AdminLayout';
import AuthGuard from './components/AuthGuard';
import Dashboard from './pages/Dashboard';
import Quotes from './pages/Quotes';
import Inquiries from './pages/Inquiries';
import Orders from './pages/Orders';
import Login from './pages/Login';
import Users from './pages/Users';
import Settings from './pages/Settings';
import './App.css';

function App() {
  return (
    <BrowserRouter basename="/admin">
      <Routes>
        <Route path="login" element={<Login />} />
        <Route path="/" element={<AuthGuard><AdminLayout /></AuthGuard>}>
          <Route index element={<Dashboard />} />
          <Route path="quotes" element={<Quotes />} />
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
