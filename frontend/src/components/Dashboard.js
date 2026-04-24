import React, { useState, useEffect } from 'react';
import { Box, Typography, Paper, useTheme, Button } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import SystemMonitor from './SystemMonitor';
import DashboardIcon from '@mui/icons-material/Dashboard';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import SystemUpdateAltIcon from '@mui/icons-material/SystemUpdateAlt';
import { useUpdateStatus } from './UpdateStatusProvider';

const Dashboard = ({ auth, userInfo }) => {
    const theme = useTheme();
    const navigate = useNavigate();
    const [vpnConnected, setVpnConnected] = useState(false);
    const { currentVersion, updateInfo, isUpdateInProgress, updateStatus } = useUpdateStatus();

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
            {/* إشعار التحديث */}
            {updateInfo?.has_update && !isUpdateInProgress && (
                <Paper sx={{
                    p: 1.5, mb: 1.5,
                    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                    color: 'white', borderRadius: 2,
                    display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap',
                    boxShadow: '0 2px 12px rgba(245,158,11,0.3)'
                }}>
                    <SystemUpdateAltIcon />
                    <Box sx={{ flex: 1 }}>
                        <Typography variant="body2" fontWeight={700}>
                            يتوفر تحديث جديد — الإصدار {updateInfo.latest_version}
                        </Typography>
                        {updateInfo.release_name && (
                            <Typography variant="caption" sx={{ opacity: 0.9 }}>
                                {updateInfo.release_name}
                            </Typography>
                        )}
                    </Box>
                    <Button
                        size="small"
                        variant="contained"
                        onClick={() => navigate('/admin/settings', { state: { tab: 3 } })}
                        sx={{
                            bgcolor: 'rgba(255,255,255,0.2)',
                            color: 'white', fontWeight: 700,
                            '&:hover': { bgcolor: 'rgba(255,255,255,0.35)' }
                        }}
                    >
                        تحديث الآن
                    </Button>
                </Paper>
            )}
            {isUpdateInProgress && (
                <Paper sx={{
                    p: 1.5, mb: 1.5, borderRadius: 2,
                    border: '1px solid', borderColor: 'info.main', bgcolor: 'info.50'
                }}>
                    <Typography variant="body2" fontWeight={700} color="info.dark">
                        التحديث قيد التنفيذ: {updateStatus.progress || 0}%
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        {updateStatus.message || 'جاري تنفيذ خطوات التحديث...'}
                    </Typography>
                </Paper>
            )}

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
                            الإصدار {currentVersion || '...'}
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
