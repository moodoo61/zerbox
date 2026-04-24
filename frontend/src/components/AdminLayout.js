import React, { useMemo, useState } from 'react';
import { NavLink as RouterNavLink, Outlet, useNavigate } from 'react-router-dom';
import {
    Box, Drawer, List, ListItem, ListItemButton, ListItemIcon,
    ListItemText, Typography, Button, CssBaseline, Divider,
    useMediaQuery, IconButton, ThemeProvider, createTheme, Chip,
    Dialog, DialogTitle, DialogContent, DialogActions
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import MenuIcon from '@mui/icons-material/Menu';
import LogoutIcon from '@mui/icons-material/Logout';
import HubIcon from '@mui/icons-material/Hub';
import WifiIcon from '@mui/icons-material/Wifi';
import AppsIcon from '@mui/icons-material/Apps';
import NotificationsIcon from '@mui/icons-material/Notifications';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { VscDashboard } from "react-icons/vsc";
import { GrServices } from "react-icons/gr";
import { IoSettingsOutline } from "react-icons/io5";
import GlobalUpdateBanner from './GlobalUpdateBanner';

const ROLE_LABELS = { owner: 'مالك', manager: 'مدير', sub_manager: 'مدير فرعي' };

const getAdminTypographyTheme = (baseTheme) => createTheme({
    ...baseTheme,
    typography: {
        ...baseTheme.typography,
        h1: { ...baseTheme.typography.h1, fontSize: '1.5rem', fontWeight: 700 },
        h2: { ...baseTheme.typography.h2, fontSize: '1.35rem', fontWeight: 600 },
        h3: { ...baseTheme.typography.h3, fontSize: '1.2rem', fontWeight: 600 },
        h4: { ...baseTheme.typography.h4, fontSize: '1.15rem', fontWeight: 600 },
        h5: { ...baseTheme.typography.h5, fontSize: '1.05rem', fontWeight: 600 },
        h6: { ...baseTheme.typography.h6, fontSize: '1rem', fontWeight: 600 },
        subtitle1: { ...baseTheme.typography.subtitle1, fontSize: '0.95rem', fontWeight: 500 },
        subtitle2: { ...baseTheme.typography.subtitle2, fontSize: '0.9rem', fontWeight: 500 },
        body1: { ...baseTheme.typography.body1, fontSize: '0.9rem' },
        body2: { ...baseTheme.typography.body2, fontSize: '0.8rem' },
        caption: { ...baseTheme.typography.caption, fontSize: '0.75rem' },
        button: { ...baseTheme.typography.button, fontSize: '0.875rem' },
    },
});

const drawerWidth = 240;

const ALL_NAV_ITEMS = [
    { text: 'نظرة عامة', sectionKey: 'نظرة عامة', path: '/admin', icon: <VscDashboard size="1.2em" /> },
    { text: 'الخدمات', sectionKey: 'الخدمات', path: '/admin/services', icon: <GrServices size="1.2em" /> },
    { text: 'البث المباشر', sectionKey: 'البث المباشر', path: '/admin/streaming', icon: <HubIcon size="1.2em" /> },
    { text: 'التطبيقات', sectionKey: 'التطبيقات', path: '/admin/apps', icon: <AppsIcon fontSize="small" />, badge: 'Soon' },
    { text: 'الإشعارات', sectionKey: 'الإشعارات', path: '/admin/notifications', icon: <NotificationsIcon fontSize="small" /> },
    { text: 'طلبات التوصيل', sectionKey: 'طلبات التوصيل', path: '/admin/delivery-requests', icon: <WifiIcon size="1.2em" /> },
    { text: 'الضبط', sectionKey: 'الضبط', path: '/admin/settings', icon: <IoSettingsOutline size="1.2em" /> },
];

function getVisibleNavItems(userInfo) {
    if (!userInfo) return ALL_NAV_ITEMS;
    if (userInfo.role === 'owner') return ALL_NAV_ITEMS;

    let perms = {};
    try {
        perms = typeof userInfo.permissions === 'string'
            ? JSON.parse(userInfo.permissions)
            : userInfo.permissions || {};
    } catch { perms = {}; }

    return ALL_NAV_ITEMS.filter(item => {
        const p = perms[item.sectionKey];
        if (!p) return true;
        return p.visible !== false;
    });
}

const AdminLayout = ({ setAuth, userInfo }) => {
    const navigate = useNavigate();
    const theme = useTheme();
    const adminTheme = useMemo(() => getAdminTypographyTheme(theme), [theme]);
    const isMdUp = useMediaQuery(theme.breakpoints.up('md'));
    const [mobileOpen, setMobileOpen] = React.useState(false);
    const [showPasswordAlert, setShowPasswordAlert] = useState(userInfo?.is_default === true);

    const navItems = useMemo(() => getVisibleNavItems(userInfo), [userInfo]);

    const handleDrawerToggle = () => {
        setMobileOpen(!mobileOpen);
    };

    const handleLogout = () => {
        setAuth(null);
        navigate('/');
    };

    const drawerContent = (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5, py: 2.5, px: 1 }}>
                    <Box
                        component="img"
                        src="/zerolag-logo.png"
                        alt="ZEROLAG"
                        sx={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                    />
                    <Box sx={{ textAlign: 'center' }}>
                        <Typography variant="subtitle1" sx={{ color: '#fff', fontWeight: 'bold', lineHeight: 1.2 }}>
                            لوحة التحكم
                        </Typography>
                        {userInfo && (
                            <Chip
                                label={`${userInfo.username} (${ROLE_LABELS[userInfo.role] || userInfo.role})`}
                                size="small"
                                sx={{
                                    mt: 0.5, height: 20, fontSize: '0.6rem',
                                    color: 'rgba(255,255,255,0.8)',
                                    borderColor: 'rgba(255,255,255,0.3)',
                                    bgcolor: 'rgba(255,255,255,0.1)',
                                }}
                                variant="outlined"
                            />
                        )}
                    </Box>
                </Box>
                <Divider sx={{ borderColor: 'rgba(255, 255, 255, 0.12)' }} />
            </Box>

            <Box sx={{ flex: 1, overflow: 'auto' }}>
                <List sx={{ p: 1 }}>
                    {navItems.map((item) => (
                        <ListItem key={item.text} disablePadding>
                            <ListItemButton
                                component={RouterNavLink}
                                to={item.path}
                                end={item.path === '/admin'}
                                sx={{
                                    color: 'rgba(255, 255, 255, 0.7)',
                                    borderRadius: '8px',
                                    mb: 0.5,
                                    '&:hover': { backgroundColor: 'rgba(255, 255, 255, 0.05)' },
                                    '&.active': { backgroundColor: 'rgba(67, 81, 255, 0.2)', color: '#fff', fontWeight: 'bold' },
                                }}
                                onClick={!isMdUp ? handleDrawerToggle : undefined}
                            >
                                <ListItemIcon sx={{ color: 'inherit', minWidth: '40px' }}>{item.icon}</ListItemIcon>
                                <ListItemText primary={
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        {item.text}
                                        {item.badge && (
                                            <Box component="span" sx={{
                                                fontSize: '0.55rem', fontWeight: 800,
                                                px: 0.8, py: 0.15, borderRadius: '6px',
                                                background: 'linear-gradient(135deg, #f59e0b, #f97316)',
                                                color: '#fff', letterSpacing: '0.04em'
                                            }}>
                                                {item.badge}
                                            </Box>
                                        )}
                                    </Box>
                                } />
                            </ListItemButton>
                        </ListItem>
                    ))}
                </List>
            </Box>

            <Box sx={{ p: 2, borderTop: '1px solid rgba(255, 255, 255, 0.12)' }}>
                <Button
                    fullWidth
                    variant="outlined"
                    startIcon={<LogoutIcon />}
                    onClick={handleLogout}
                    sx={{
                        color: 'rgba(255, 255, 255, 0.7)',
                        borderColor: 'rgba(255, 255, 255, 0.23)',
                        '&:hover': {
                            backgroundColor: 'rgba(255, 255, 255, 0.05)',
                            borderColor: 'rgba(255, 255, 255, 0.5)',
                            color: '#fff'
                        }
                    }}
                >
                    تسجيل الخروج
                </Button>
            </Box>
        </Box>
    );

    return (
        <ThemeProvider theme={adminTheme}>
        <Box sx={{ display: 'flex', bgcolor: '#f9fafb', minHeight: '100vh', direction: 'rtl' }}>
            <CssBaseline />

            <Box component="nav" sx={{ flexShrink: 0 }}>
                {!isMdUp && (
                    <Box sx={{
                        position: 'fixed', top: 16, left: 16, zIndex: 1300,
                        display: mobileOpen ? 'none' : 'block'
                    }}>
                        <IconButton
                            color="primary"
                            aria-label="open drawer"
                            onClick={handleDrawerToggle}
                            sx={{ bgcolor: 'white', boxShadow: 3, '&:hover': { bgcolor: 'grey.100' } }}
                        >
                            <MenuIcon />
                        </IconButton>
                    </Box>
                )}

                <Drawer
                    variant="temporary"
                    anchor="left"
                    open={mobileOpen}
                    onClose={handleDrawerToggle}
                    ModalProps={{ keepMounted: true }}
                    sx={{
                        display: { xs: 'block', md: 'none' },
                        '& .MuiDrawer-paper': {
                            boxSizing: 'border-box', width: drawerWidth,
                            backgroundColor: '#111827', color: '#fff',
                            borderRight: 'none', direction: 'rtl'
                        },
                    }}
                >
                    {drawerContent}
                </Drawer>

                <Drawer
                    variant="permanent"
                    anchor="left"
                    sx={{
                        display: { xs: 'none', md: 'block' },
                        '& .MuiDrawer-paper': {
                            boxSizing: 'border-box', width: drawerWidth,
                            backgroundColor: '#111827', color: '#fff',
                            borderRight: 'none', direction: 'rtl'
                        },
                    }}
                    open
                >
                    {drawerContent}
                </Drawer>
            </Box>

            <Box
                component="main"
                sx={{
                    flexGrow: 1,
                    p: { xs: '10px', md: 2.5 },
                    direction: 'rtl',
                    marginLeft: { xs: 0, md: `${drawerWidth}px` },
                    minHeight: '100vh'
                }}
            >
                <GlobalUpdateBanner />
                <Outlet />
            </Box>

            {/* تنبيه تغيير كلمة المرور للحساب الافتراضي */}
            <Dialog
                open={showPasswordAlert}
                maxWidth="xs"
                fullWidth
                PaperProps={{ sx: { borderRadius: 3, direction: 'rtl' } }}
            >
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 1 }}>
                    <WarningAmberIcon color="warning" fontSize="large" />
                    <Typography variant="h6" fontWeight={700}>تنبيه أمني</Typography>
                </DialogTitle>
                <DialogContent>
                    <Typography variant="body1" sx={{ mb: 1 }}>
                        أنت تستخدم <strong>الحساب الافتراضي</strong> ببيانات الدخول الأصلية.
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        لضمان أمان لوحة التحكم، يُرجى تغيير كلمة المرور من قسم <strong>الضبط → إدارة الصلاحيات</strong>.
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
                    <Button onClick={() => setShowPasswordAlert(false)} color="inherit" variant="text">
                        لاحقاً
                    </Button>
                    <Button
                        variant="contained"
                        color="warning"
                        onClick={() => { setShowPasswordAlert(false); navigate('/admin/settings'); }}
                    >
                        تغيير كلمة المرور الآن
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
        </ThemeProvider>
    );
};

export default AdminLayout;
