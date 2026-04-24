import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import HomePage from './components/HomePage';
import LoginPage from './components/LoginPage';
import AdminLayout from './components/AdminLayout';
import Dashboard from './components/Dashboard';
import ServiceManager from './components/ServiceManager';
import StreamingManager from './components/StreamingManager';
import SettingsManager from './components/SettingsManager';
import DeliveryRequestsManager from './components/DeliveryRequestsManager';
import AppsManager from './components/AppsManager';
import NotificationsManager from './components/NotificationsManager';
import ViewerPage from './components/ViewerPage';
import { UpdateStatusProvider } from './components/UpdateStatusProvider';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import { arEG } from '@mui/material/locale';

const PAGE_TITLES = {
  '/': 'ZEROLAG - الرئيسية',
  '/mubasher': 'ZEROLAG - البث المباشر',
  '/login': 'ZEROLAG - تسجيل الدخول',
  '/admin': 'ZEROLAG - لوحة التحكم',
  '/admin/services': 'ZEROLAG - الخدمات',
  '/admin/streaming': 'ZEROLAG - البث',
  '/admin/apps': 'ZEROLAG - التطبيقات',
  '/admin/notifications': 'ZEROLAG - الإشعارات',
  '/admin/delivery-requests': 'ZEROLAG - طلبات التوصيل',
  '/admin/settings': 'ZEROLAG - الإعدادات',
};

const theme = createTheme({
  direction: 'rtl',
  typography: {
    fontFamily: [
      'Noto Sans Arabic',
      'Cairo',
      'Roboto',
      'Arial',
      'sans-serif'
    ].join(','),
    h1: { fontWeight: 700, fontSize: '2.5rem', letterSpacing: '-0.02em' },
    h2: { fontWeight: 600, fontSize: '2rem', letterSpacing: '-0.01em' },
    h3: { fontWeight: 600, fontSize: '1.75rem' },
    h4: { fontWeight: 600, fontSize: '1.5rem' },
    h5: { fontWeight: 600, fontSize: '1.25rem' },
    h6: { fontWeight: 600, fontSize: '1.125rem' },
    subtitle1: { fontWeight: 500, fontSize: '1rem' },
    body1: { fontSize: '1rem', lineHeight: 1.6 },
    body2: { fontSize: '0.875rem', lineHeight: 1.6 },
  },
  palette: {
    primary: { main: '#1976d2', light: '#42a5f5', dark: '#1565c0', contrastText: '#fff' },
    secondary: { main: '#9c27b0', light: '#ba68c8', dark: '#7b1fa2', contrastText: '#fff' },
    success: { main: '#4caf50', light: '#81c784', dark: '#388e3c', contrastText: '#fff' },
    error: { main: '#f44336', light: '#e57373', dark: '#d32f2f', contrastText: '#fff' },
    warning: { main: '#ff9800', light: '#ffb74d', dark: '#f57c00', contrastText: '#fff' },
    info: { main: '#2196f3', light: '#64b5f6', dark: '#1976d2', contrastText: '#fff' },
    background: { default: '#f8fafc', paper: '#ffffff' },
    text: { primary: '#1e293b', secondary: '#64748b' },
    grey: { 50:'#fafafa',100:'#f5f5f5',200:'#eeeeee',300:'#e0e0e0',400:'#bdbdbd',500:'#9e9e9e',600:'#757575',700:'#616161',800:'#424242',900:'#212121' },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          direction: 'rtl',
          fontFamily: '"Cairo", "Noto Sans Arabic", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important',
        },
        '*': {
          fontFamily: '"Cairo", "Noto Sans Arabic", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important',
        },
        'h1, h2, h3, h4, h5, h6, p, span, div, button, input, textarea': {
          fontFamily: '"Cairo", "Noto Sans Arabic", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important',
        }
      },
    },
    MuiTypography: { styleOverrides: { root: { fontFamily: '"Cairo", "Noto Sans Arabic", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important' } } },
    MuiButton: { styleOverrides: { root: { fontFamily: '"Cairo", "Noto Sans Arabic", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important' } } },
  },
}, arEG);

function App() {
  const [auth, setAuth] = useState(localStorage.getItem('authToken'));
  const [userInfo, setUserInfo] = useState(() => {
    try {
      const stored = localStorage.getItem('userInfo');
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  });

  useEffect(() => {
    if (auth) {
      localStorage.setItem('authToken', auth);
    } else {
      localStorage.removeItem('authToken');
      localStorage.removeItem('userInfo');
      setUserInfo(null);
    }
  }, [auth]);

  useEffect(() => {
    if (userInfo) {
      localStorage.setItem('userInfo', JSON.stringify(userInfo));
    }
  }, [userInfo]);

  function DocumentTitle() {
    const location = useLocation();
    useEffect(() => {
      document.title = PAGE_TITLES[location.pathname] || 'ZEROLAG';
    }, [location.pathname]);
    return null;
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Router>
        <DocumentTitle />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/mubasher" element={<ViewerPage />} />
          <Route
            path="/login"
            element={<LoginPage setAuth={setAuth} setUserInfo={setUserInfo} />}
          />

          <Route
            path="/admin"
            element={
              auth ? (
                <UpdateStatusProvider auth={auth}>
                  <AdminLayout setAuth={setAuth} userInfo={userInfo} />
                </UpdateStatusProvider>
              ) : <Navigate to="/login" />
            }
          >
            <Route index element={<Dashboard auth={auth} userInfo={userInfo} />} />
            <Route path="services" element={<ServiceManager auth={auth} userInfo={userInfo} />} />
            <Route path="streaming" element={<StreamingManager auth={auth} userInfo={userInfo} />} />
            <Route path="apps" element={<AppsManager auth={auth} userInfo={userInfo} />} />
            <Route path="notifications" element={<NotificationsManager auth={auth} userInfo={userInfo} />} />
            <Route path="delivery-requests" element={<DeliveryRequestsManager auth={auth} userInfo={userInfo} />} />
            <Route path="settings" element={<SettingsManager auth={auth} setAuth={setAuth} userInfo={userInfo} setUserInfo={setUserInfo} />} />
          </Route>

        </Routes>
      </Router>
    </ThemeProvider>
  );
}

export default App;
