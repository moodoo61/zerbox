import React, { useMemo } from 'react';
import { NavLink as RouterNavLink, Outlet, useNavigate } from 'react-router-dom';
import {
    Box, Drawer, List, ListItem, ListItemButton, ListItemIcon,
    ListItemText, Typography, Button, CssBaseline, Divider,
    useMediaQuery, IconButton, ThemeProvider, createTheme
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import MenuIcon from '@mui/icons-material/Menu';
import LogoutIcon from '@mui/icons-material/Logout';
import HubIcon from '@mui/icons-material/Hub';
import WifiIcon from '@mui/icons-material/Wifi';
import AppsIcon from '@mui/icons-material/Apps';
import NotificationsIcon from '@mui/icons-material/Notifications';
import { VscDashboard } from "react-icons/vsc";
import { GrServices } from "react-icons/gr";
import { IoSettingsOutline } from "react-icons/io5";

/** معيار خطوط لوحة التحكم: عناوين رئيسية وفرعية وجسم نص موحّدة ومضغوطة */
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

const AdminLayout = ({ setAuth }) => {
    const navigate = useNavigate();
    const theme = useTheme();
    const adminTheme = useMemo(() => getAdminTypographyTheme(theme), [theme]);
    const isMdUp = useMediaQuery(theme.breakpoints.up('md'));
    const [mobileOpen, setMobileOpen] = React.useState(false);

    const handleDrawerToggle = () => {
        setMobileOpen(!mobileOpen);
    };

    const handleLogout = () => {
        setAuth(null);
        navigate('/');
    };

    const navItems = [
        { text: 'نظرة عامة', path: '/admin', icon: <VscDashboard size="1.2em" /> },
        { text: 'الخدمات', path: '/admin/services', icon: <GrServices size="1.2em" /> },
        { text: 'البث المباشر', path: '/admin/streaming', icon: <HubIcon size="1.2em" /> },
        { text: 'التطبيقات', path: '/admin/apps', icon: <AppsIcon fontSize="small" />, badge: 'Soon' },
        { text: 'الإشعارات', path: '/admin/notifications', icon: <NotificationsIcon fontSize="small" /> },
        { text: 'طلبات التوصيل', path: '/admin/delivery-requests', icon: <WifiIcon size="1.2em" /> },
        { text: 'الضبط', path: '/admin/settings', icon: <IoSettingsOutline size="1.2em" /> },
    ];

    const drawerContent = (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5, py: 2.5, px: 1 }}>
                    <Box
                        component="img"
                        src="/zerolag-logo.png"
                        alt="ZEROLAG"
                        sx={{
                            width: 48,
                            height: 48,
                            borderRadius: '50%',
                            objectFit: 'cover',
                            flexShrink: 0,
                        }}
                    />
                    <Typography variant="subtitle1" sx={{ color: '#fff', fontWeight: 'bold' }}>
                        لوحة التحكم
                    </Typography>
                </Box>
                <Divider sx={{ borderColor: 'rgba(255, 255, 255, 0.12)' }} />
            </Box>

            {/* Navigation Menu */}
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
                                    '&:hover': {
                                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                    },
                                    '&.active': {
                                        backgroundColor: 'rgba(67, 81, 255, 0.2)',
                                        color: '#fff',
                                        fontWeight: 'bold',
                                    },
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

            {/* Logout Button at Bottom */}
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
            
            {/* Navigation Drawer */}
            <Box component="nav" sx={{ flexShrink: 0 }}>
                {/* Mobile Menu Button - Only visible on mobile when drawer is closed */}
                {!isMdUp && (
                    <Box sx={{ 
                        position: 'fixed', 
                        top: 16, 
                        left: 16, 
                        zIndex: 1300,
                        display: mobileOpen ? 'none' : 'block'
                    }}>
                        <IconButton
                            color="primary"
                            aria-label="open drawer"
                            onClick={handleDrawerToggle}
                            sx={{ 
                                bgcolor: 'white', 
                                boxShadow: 3,
                                '&:hover': { bgcolor: 'grey.100' }
                            }}
                        >
                            <MenuIcon />
                        </IconButton>
                    </Box>
                )}

                {/* Mobile Drawer */}
                <Drawer
                    variant="temporary"
                    anchor="left"
                    open={mobileOpen}
                    onClose={handleDrawerToggle}
                    ModalProps={{
                        keepMounted: true,
                    }}
                    sx={{
                        display: { xs: 'block', md: 'none' },
                        '& .MuiDrawer-paper': {
                            boxSizing: 'border-box',
                            width: drawerWidth,
                            backgroundColor: '#111827',
                            color: '#fff',
                            borderRight: 'none',
                            direction: 'rtl'
                        },
                    }}
                >
                    {drawerContent}
                </Drawer>

                {/* Desktop Drawer */}
                <Drawer
                    variant="permanent"
                    anchor="left"
                    sx={{
                        display: { xs: 'none', md: 'block' },
                        '& .MuiDrawer-paper': {
                            boxSizing: 'border-box',
                            width: drawerWidth,
                            backgroundColor: '#111827',
                            color: '#fff',
                            borderRight: 'none',
                            direction: 'rtl'
                        },
                    }}
                    open
                >
                    {drawerContent}
                </Drawer>
            </Box>

            {/* Main Content Area */}
            <Box
                component="main"
                sx={{
                    flexGrow: 1,
                    p: 2.5,
                    direction: 'rtl',
                    marginLeft: { xs: 0, md: `${drawerWidth}px` },
                    minHeight: '100vh'
                }}
            >
                <Outlet />
            </Box>
        </Box>
        </ThemeProvider>
    );
};

export default AdminLayout;
