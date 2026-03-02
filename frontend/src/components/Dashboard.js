import React, { useState, useEffect } from 'react';
import { Box, Typography, Paper, useTheme } from '@mui/material';
import SystemMonitor from './SystemMonitor';
import DashboardIcon from '@mui/icons-material/Dashboard';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';

const PROJECT_VERSION = '1.0.1';

const Dashboard = ({ auth, userInfo }) => {
    const theme = useTheme();
    const [vpnConnected, setVpnConnected] = useState(false);

    useEffect(() => {
        if (!auth) return;
        const fetchVpnStatus = async () => {
            try {
                const res = await fetch('/api/stats', { headers: { 'Authorization': 'Basic ' + auth } });
                if (res.ok) {
                    const data = await res.json();
                    setVpnConnected(!!data.vpn_connected);
                }
            } catch (_) {}
        };
        fetchVpnStatus();
        const interval = setInterval(fetchVpnStatus, 3000);
        return () => clearInterval(interval);
    }, [auth]);

    return (
        <Box sx={{ width: '100%' }}>
            {/* رأس نظرة عامة */}
            <Paper sx={{ 
                p: 1.5, 
                mb: 1.5,
                background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
                color: 'white',
                borderRadius: 2,
                boxShadow: `0 2px 15px rgba(0,0,0,0.15)`
            }}>
                <Box sx={{ 
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    width: '100%'
                }}>
                    <DashboardIcon sx={{ fontSize: 24 }} />
                    <Box>
                        <Typography variant="h6" sx={{ 
                            fontWeight: 'bold',
                            textShadow: '0 1px 5px rgba(0,0,0,0.3)'
                        }}>
                            نظرة عامة
                        </Typography>
                        <Typography variant="caption" sx={{ 
                            opacity: 0.9,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 0.5
                        }}>
                            <TrendingUpIcon fontSize="small" />
                            مراقبة النظام في الوقت الفعلي
                        </Typography>
                    </Box>
                    {/* الإصدار ومؤشر ZeroLAG VPN في الطرف الأيسر */}
                    <Box sx={{ marginRight: 'auto', display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Typography
                            component="span"
                            variant="caption"
                            sx={{ color: 'rgba(255,255,255,0.85)', fontWeight: 500 }}
                        >
                            الإصدار {PROJECT_VERSION}
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Box
                                sx={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: '50%',
                                    bgcolor: vpnConnected ? '#4caf50' : '#f44336',
                                    boxShadow: '0 0 0 1px rgba(255,255,255,0.3)',
                                    flexShrink: 0
                                }}
                            />
                            <Typography
                                component="span"
                                variant="caption"
                                sx={{ color: 'rgba(255,255,255,0.75)', fontWeight: 500 }}
                            >
                                ZeroLAG
                            </Typography>
                        </Box>
                    </Box>
                </Box>
            </Paper>

            {/* محتوى نظرة عامة */}
            <SystemMonitor auth={auth} userInfo={userInfo} />
        </Box>
    );
};

export default Dashboard; 