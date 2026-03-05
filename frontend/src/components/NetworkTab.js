import React, { useState, useEffect, useCallback } from 'react';
import {
    Box, Typography, Card, CardContent, Alert, Button, TextField,
    CircularProgress, ToggleButtonGroup, ToggleButton, Grid, Divider,
    Chip, Collapse, Table, TableBody, TableCell, TableContainer,
    TableHead, TableRow, IconButton, Tooltip,
    Dialog, DialogTitle, DialogContent, DialogActions
} from '@mui/material';
import {
    Wifi as WifiIcon,
    Cable as EthernetIcon,
    SettingsEthernet as SettingsIcon,
    Refresh as RefreshIcon,
    Save as SaveIcon,
    WifiTethering as HotspotIcon,
    WifiTetheringOff as HotspotOffIcon,
    Person as PersonIcon,
    SignalWifi4Bar as SignalIcon,
    Router as RouterIcon,
    ContentCopy as CopyIcon,
    PowerSettingsNew as PowerIcon,
    OpenInNew as OpenInNewIcon
} from '@mui/icons-material';

const NetworkTab = ({ auth }) => {
    const [interfaces, setInterfaces] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [nmAvailable, setNmAvailable] = useState(false);
    const [helperAvailable, setHelperAvailable] = useState(false);
    const [expandedIface, setExpandedIface] = useState(null);
    const [saving, setSaving] = useState(null);
    const [saveError, setSaveError] = useState(null);
    const [saveSuccess, setSaveSuccess] = useState(null);
    const [form, setForm] = useState({});

    // Hotspot state
    const [hotspot, setHotspot] = useState({ active: false, details: {}, message: '' });
    const [hotspotClients, setHotspotClients] = useState([]);
    const [hotspotLoading, setHotspotLoading] = useState(true);
    const [hotspotToggling, setHotspotToggling] = useState(false);
    const [hotspotError, setHotspotError] = useState(null);
    const [hotspotSuccess, setHotspotSuccess] = useState(null);

    // IP change redirect dialog
    const [redirectInfo, setRedirectInfo] = useState(null);

    // Project port state
    const [projectPort, setProjectPort] = useState('');
    const [projectPortInput, setProjectPortInput] = useState('');
    const [projectPortLoading, setProjectPortLoading] = useState(true);
    const [projectPortSaving, setProjectPortSaving] = useState(false);
    const [projectPortError, setProjectPortError] = useState(null);
    const [projectPortSuccess, setProjectPortSuccess] = useState(null);

    const fetchInterfaces = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/network/interfaces', {
                headers: { 'Authorization': `Basic ${auth}` }
            });
            if (!res.ok) throw new Error('فشل في جلب بيانات الشبكة');
            const data = await res.json();
            setInterfaces(data.interfaces || []);
            setNmAvailable(data.nm_available === true);
            setHelperAvailable(data.helper_available === true);
        } catch (err) {
            setError(err.message);
            setInterfaces([]);
        } finally {
            setLoading(false);
        }
    }, [auth]);

    const fetchHotspotStatus = useCallback(async () => {
        try {
            const res = await fetch('/api/network/wifi-hotspot', {
                headers: { 'Authorization': `Basic ${auth}` }
            });
            if (res.ok) {
                const data = await res.json();
                setHotspot({
                    active: data.active === true,
                    details: data.details || {},
                    message: data.message || ''
                });
            }
        } catch (err) {
            console.error('Hotspot status error:', err);
        } finally {
            setHotspotLoading(false);
        }
    }, [auth]);

    const fetchHotspotClients = useCallback(async () => {
        try {
            const res = await fetch('/api/network/wifi-hotspot/clients', {
                headers: { 'Authorization': `Basic ${auth}` }
            });
            if (res.ok) {
                const data = await res.json();
                setHotspotClients(data.clients || []);
            }
        } catch (err) {
            console.error('Hotspot clients error:', err);
        }
    }, [auth]);

    const fetchProjectPort = useCallback(async () => {
        try {
            const res = await fetch('/api/network/project-port', {
                headers: { 'Authorization': `Basic ${auth}` }
            });
            if (res.ok) {
                const data = await res.json();
                const port = String(data.port || 8000);
                setProjectPort(port);
                setProjectPortInput(port);
            }
        } catch (err) {
            console.error('Project port fetch error:', err);
        } finally {
            setProjectPortLoading(false);
        }
    }, [auth]);

    useEffect(() => {
        fetchInterfaces();
        fetchHotspotStatus();
        fetchProjectPort();
    }, [fetchInterfaces, fetchHotspotStatus, fetchProjectPort]);

    useEffect(() => {
        if (hotspot.active) {
            fetchHotspotClients();
            const interval = setInterval(fetchHotspotClients, 15000);
            return () => clearInterval(interval);
        } else {
            setHotspotClients([]);
        }
    }, [hotspot.active, fetchHotspotClients]);

    const getWifiInterface = () => {
        return interfaces.find(i => i.type === 'wifi');
    };

    const handleHotspotToggle = async () => {
        setHotspotToggling(true);
        setHotspotError(null);
        setHotspotSuccess(null);
        try {
            if (hotspot.active) {
                const res = await fetch('/api/network/wifi-hotspot/stop', {
                    method: 'POST',
                    headers: { 'Authorization': `Basic ${auth}` }
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.detail || 'فشل في إيقاف الهوتسبوت');
                setHotspotSuccess('تم إيقاف الهوتسبوت بنجاح');
            } else {
                const wifiIface = getWifiInterface();
                if (!wifiIface) throw new Error('لم يتم العثور على واجهة واي فاي');
                const res = await fetch('/api/network/wifi-hotspot/start', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Basic ${auth}`
                    },
                    body: JSON.stringify({
                        ifname: wifiIface.name,
                        ssid: 'ZeroLAG',
                        gateway: '192.168.60.1'
                    })
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.detail || 'فشل في تفعيل الهوتسبوت');
                setHotspotSuccess('تم تفعيل الهوتسبوت بنجاح');
            }
            await new Promise(r => setTimeout(r, 1500));
            await fetchHotspotStatus();
            await fetchInterfaces();
        } catch (err) {
            setHotspotError(err.message);
        } finally {
            setHotspotToggling(false);
        }
    };

    const handleExpand = (name) => {
        if (expandedIface === name) {
            setExpandedIface(null);
            return;
        }
        setExpandedIface(name);
        const iface = interfaces.find((i) => i.name === name);
        if (iface) {
            setForm({
                method: iface.method === 'static' ? 'static' : 'dhcp',
                address: iface.config_address || iface.ipv4?.split('/')[0] || '',
                prefix: iface.config_prefix ?? 24,
                gateway: iface.config_gateway || iface.gateway || '',
                dns: iface.config_dns || ''
            });
        }
        setSaveError(null);
        setSaveSuccess(null);
    };

    const handleSave = async (ifname) => {
        setSaving(ifname);
        setSaveError(null);
        setSaveSuccess(null);

        const currentHost = window.location.hostname;
        const iface = interfaces.find(i => i.name === ifname);
        const currentIfaceIp = iface?.ipv4?.split('/')[0];
        const isChangingOwnIp = currentHost === currentIfaceIp || currentHost === iface?.config_address;

        try {
            const payload = {
                method: form.method,
                address: form.method === 'static' ? form.address : null,
                prefix: form.method === 'static' ? (form.prefix || 24) : null,
                gateway: form.method === 'static' ? (form.gateway || null) : null,
                dns: form.method === 'static' ? (form.dns || null) : null
            };
            const res = await fetch(`/api/network/interface/${ifname}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Basic ${auth}`
                },
                body: JSON.stringify(payload)
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.detail || 'فشل في تطبيق الإعدادات');

            if (isChangingOwnIp) {
                const port = window.location.port || projectPort || '8000';
                if (form.method === 'static' && form.address) {
                    setRedirectInfo({
                        newIp: form.address,
                        port,
                        isDhcp: false,
                    });
                } else {
                    setRedirectInfo({
                        newIp: null,
                        port,
                        isDhcp: true,
                    });
                }
            } else {
                setSaveSuccess(ifname);
                fetchInterfaces();
            }
        } catch (err) {
            setSaveError(err.message);
        } finally {
            setSaving(null);
        }
    };

    const handlePortSave = async () => {
        const newPort = parseInt(projectPortInput, 10);
        if (!newPort || newPort < 1 || newPort > 65535) {
            setProjectPortError('المنفذ يجب أن يكون رقماً بين 1 و 65535');
            return;
        }
        if (String(newPort) === projectPort) {
            setProjectPortError('المنفذ الجديد مطابق للمنفذ الحالي');
            return;
        }
        setProjectPortSaving(true);
        setProjectPortError(null);
        setProjectPortSuccess(null);
        try {
            const res = await fetch('/api/network/project-port', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Basic ${auth}`
                },
                body: JSON.stringify({ port: newPort })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.detail || 'فشل في تغيير المنفذ');
            const host = window.location.hostname;
            setRedirectInfo({
                newIp: host,
                port: String(newPort),
                isDhcp: false,
                isPortChange: true,
            });
        } catch (err) {
            setProjectPortError(err.message);
        } finally {
            setProjectPortSaving(false);
        }
    };

    const formatBytes = (bytes) => {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text).catch(() => {});
    };

    if (loading && hotspotLoading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress />
            </Box>
        );
    }

    const wifiInterface = getWifiInterface();

    const hotspotCard = (
        <Card
            variant="outlined"
            sx={{
                mt: 2,
                borderColor: hotspot.active ? 'success.main' : 'divider',
                borderWidth: hotspot.active ? 2 : 1,
                background: hotspot.active
                    ? 'linear-gradient(135deg, rgba(46,125,50,0.04) 0%, rgba(46,125,50,0.01) 100%)'
                    : 'transparent',
                transition: 'all 0.3s ease',
            }}
        >
            <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2, mb: hotspotError || hotspotSuccess || !helperAvailable || hotspot.active ? 2 : 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        {hotspot.active ? (
                            <HotspotIcon sx={{ fontSize: 36, color: 'success.main' }} />
                        ) : (
                            <HotspotOffIcon sx={{ fontSize: 36, color: 'text.disabled' }} />
                        )}
                        <Box>
                            <Typography variant="h6" sx={{ fontWeight: 700 }}>
                                نقطة الاتصال (Hotspot)
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                شبكة ZeroLAG — واي فاي مفتوحة بدون كلمة مرور — توجيه تلقائي للمتصلين
                            </Typography>
                        </Box>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Chip
                            label={hotspot.active ? 'مفعّل' : 'معطّل'}
                            color={hotspot.active ? 'success' : 'default'}
                            variant={hotspot.active ? 'filled' : 'outlined'}
                            size="small"
                            sx={{ fontWeight: 600 }}
                        />
                        <Button
                            variant={hotspot.active ? 'outlined' : 'contained'}
                            color={hotspot.active ? 'error' : 'success'}
                            size="small"
                            startIcon={hotspotToggling ? <CircularProgress size={16} /> : <PowerIcon />}
                            onClick={handleHotspotToggle}
                            disabled={hotspotToggling || !helperAvailable}
                            sx={{ minWidth: 120 }}
                        >
                            {hotspotToggling ? 'جاري...' : hotspot.active ? 'إيقاف' : 'تفعيل'}
                        </Button>
                    </Box>
                </Box>

                {hotspotError && (
                    <Alert severity="error" sx={{ mb: 2 }} onClose={() => setHotspotError(null)}>
                        {hotspotError}
                    </Alert>
                )}
                {hotspotSuccess && (
                    <Alert severity="success" sx={{ mb: 2 }} onClose={() => setHotspotSuccess(null)}>
                        {hotspotSuccess}
                    </Alert>
                )}
                {!helperAvailable && (
                    <Alert severity="warning" sx={{ mb: 2 }}>
                        لتفعيل الهوتسبوت يرجى تشغيل الخدمة الوسيطة:
                        <Box component="code" sx={{ display: 'block', mt: 0.5, p: 0.5, bgcolor: 'grey.100', borderRadius: 1, fontFamily: 'monospace', fontSize: '0.85rem' }}>
                            sudo systemctl start zero-network-helper
                        </Box>
                    </Alert>
                )}

                {hotspot.active && hotspot.details && (
                    <>
                        <Divider sx={{ my: 2 }} />
                        <Grid container spacing={2}>
                            <Grid item xs={6} sm={4} md={2}>
                                <Box sx={{ textAlign: 'center', p: 1.5, borderRadius: 2, bgcolor: 'grey.50' }}>
                                    <WifiIcon sx={{ color: 'primary.main', mb: 0.5 }} />
                                    <Typography variant="caption" display="block" color="text.secondary">SSID</Typography>
                                    <Typography variant="body2" fontWeight={700}>
                                        {hotspot.details.ssid || 'ZeroLAG'}
                                    </Typography>
                                </Box>
                            </Grid>
                            <Grid item xs={6} sm={4} md={2}>
                                <Box sx={{ textAlign: 'center', p: 1.5, borderRadius: 2, bgcolor: 'grey.50' }}>
                                    <RouterIcon sx={{ color: 'primary.main', mb: 0.5 }} />
                                    <Typography variant="caption" display="block" color="text.secondary">IP / البوابة</Typography>
                                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
                                        <Typography variant="body2" fontWeight={700}>
                                            {hotspot.details.gateway || hotspot.details.ip?.split('/')[0] || '192.168.60.1'}
                                        </Typography>
                                        <Tooltip title="نسخ">
                                            <IconButton size="small" onClick={() => copyToClipboard(hotspot.details.gateway || '192.168.60.1')}>
                                                <CopyIcon sx={{ fontSize: 14 }} />
                                            </IconButton>
                                        </Tooltip>
                                    </Box>
                                </Box>
                            </Grid>
                            <Grid item xs={6} sm={4} md={2}>
                                <Box sx={{ textAlign: 'center', p: 1.5, borderRadius: 2, bgcolor: 'grey.50' }}>
                                    <SettingsIcon sx={{ color: 'primary.main', mb: 0.5 }} />
                                    <Typography variant="caption" display="block" color="text.secondary">الواجهة</Typography>
                                    <Typography variant="body2" fontWeight={700}>
                                        {hotspot.details.ifname || '—'}
                                    </Typography>
                                </Box>
                            </Grid>
                            <Grid item xs={6} sm={4} md={2}>
                                <Box sx={{ textAlign: 'center', p: 1.5, borderRadius: 2, bgcolor: 'grey.50' }}>
                                    <SignalIcon sx={{ color: 'primary.main', mb: 0.5 }} />
                                    <Typography variant="caption" display="block" color="text.secondary">النطاق</Typography>
                                    <Typography variant="body2" fontWeight={700}>
                                        {hotspot.details.band === 'bg' ? '2.4 GHz' : hotspot.details.band === 'a' ? '5 GHz' : hotspot.details.band || '2.4 GHz'}
                                    </Typography>
                                </Box>
                            </Grid>
                            <Grid item xs={6} sm={4} md={2}>
                                <Box sx={{ textAlign: 'center', p: 1.5, borderRadius: 2, bgcolor: 'grey.50' }}>
                                    <PersonIcon sx={{ color: 'primary.main', mb: 0.5 }} />
                                    <Typography variant="caption" display="block" color="text.secondary">المتصلين</Typography>
                                    <Typography variant="body2" fontWeight={700}>
                                        {hotspotClients.length}
                                    </Typography>
                                </Box>
                            </Grid>
                            <Grid item xs={6} sm={4} md={2}>
                                <Box sx={{ textAlign: 'center', p: 1.5, borderRadius: 2, bgcolor: 'grey.50' }}>
                                    <SettingsIcon sx={{ color: 'primary.main', mb: 0.5 }} />
                                    <Typography variant="caption" display="block" color="text.secondary">MAC</Typography>
                                    <Typography variant="body2" fontWeight={700}>
                                        {hotspot.details.mac || '—'}
                                    </Typography>
                                </Box>
                            </Grid>
                        </Grid>

                        {/* Connected Clients Table */}
                        <Box sx={{ mt: 3 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                                <Typography variant="subtitle1" fontWeight={600} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <PersonIcon fontSize="small" />
                                    الأجهزة المتصلة ({hotspotClients.length})
                                </Typography>
                                <Button size="small" startIcon={<RefreshIcon />} onClick={fetchHotspotClients}>
                                    تحديث
                                </Button>
                            </Box>

                            {hotspotClients.length === 0 ? (
                                <Alert severity="info" variant="outlined">
                                    لا توجد أجهزة متصلة حالياً
                                </Alert>
                            ) : (
                                <TableContainer sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                                    <Table size="small">
                                        <TableHead>
                                            <TableRow sx={{ bgcolor: 'grey.50' }}>
                                                <TableCell sx={{ fontWeight: 700 }}>#</TableCell>
                                                <TableCell sx={{ fontWeight: 700 }}>الجهاز</TableCell>
                                                <TableCell sx={{ fontWeight: 700 }}>IP</TableCell>
                                                <TableCell sx={{ fontWeight: 700 }}>MAC</TableCell>
                                                <TableCell sx={{ fontWeight: 700 }}>الإشارة</TableCell>
                                                <TableCell sx={{ fontWeight: 700 }}>الاستهلاك</TableCell>
                                                <TableCell sx={{ fontWeight: 700 }}>مدة الاتصال</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {hotspotClients.map((client, idx) => (
                                                <TableRow key={client.mac || idx} hover>
                                                    <TableCell>{idx + 1}</TableCell>
                                                    <TableCell>
                                                        <Typography variant="body2" fontWeight={600}>
                                                            {client.hostname || 'غير معروف'}
                                                        </Typography>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Chip
                                                            label={client.ip || '—'}
                                                            size="small"
                                                            variant="outlined"
                                                            sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
                                                        />
                                                    </TableCell>
                                                    <TableCell>
                                                        <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                                                            {client.mac || '—'}
                                                        </Typography>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Typography variant="body2">
                                                            {client.signal || '—'}
                                                        </Typography>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Typography variant="caption">
                                                            ↓ {formatBytes(client.rx_bytes)} / ↑ {formatBytes(client.tx_bytes)}
                                                        </Typography>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Typography variant="body2">
                                                            {client.connected_time || '—'}
                                                        </Typography>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            )}
                        </Box>
                    </>
                )}
            </CardContent>
        </Card>
    );

    return (
        <Box sx={{ direction: 'rtl' }}>
            {/* === Network Interfaces Section === */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
                <Typography variant="h6">كروت الشبكة</Typography>
                <Button size="small" startIcon={<RefreshIcon />} onClick={() => { fetchInterfaces(); fetchHotspotStatus(); }}>
                    تحديث
                </Button>
            </Box>

            {error && (
                <Alert severity="error" sx={{ mb: 2 }}>
                    {error}
                    <Button size="small" startIcon={<RefreshIcon />} onClick={fetchInterfaces} sx={{ ml: 2 }}>
                        إعادة المحاولة
                    </Button>
                </Alert>
            )}

            {!nmAvailable && (
                <Alert severity="info" sx={{ mb: 2 }}>
                    لمعرفة طريقة الاتصال (DHCP/Static) يجب تشغيل NetworkManager (nmcli) على السيرفر.
                </Alert>
            )}

            {interfaces.length === 0 && !loading ? (
                <Typography color="text.secondary">لا توجد واجهات شبكة (عدا localhost).</Typography>
            ) : (
                <Grid container spacing={2}>
                    {interfaces.map((iface) => (
                        <React.Fragment key={iface.name}>
                            <Grid item xs={12}>
                                <Card variant="outlined" sx={{ overflow: 'hidden' }}>
                                    <CardContent>
                                        <Box
                                            sx={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                flexWrap: 'wrap',
                                                gap: 2,
                                                cursor: 'pointer'
                                            }}
                                            onClick={() => handleExpand(iface.name)}
                                        >
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                                {iface.type === 'wifi' ? (
                                                    <WifiIcon sx={{ fontSize: 32, color: 'primary.main' }} />
                                                ) : (
                                                    <EthernetIcon sx={{ fontSize: 32, color: 'primary.main' }} />
                                                )}
                                                <Box>
                                                    <Typography variant="subtitle1" fontWeight="bold">
                                                        {iface.name}
                                                    </Typography>
                                                    <Typography variant="caption" color="text.secondary">
                                                        {iface.type === 'wifi' ? 'واي فاي' : 'إيثرنت'}
                                                        {' · '}
                                                        {iface.state === 'up' ? 'متصل' : 'غير متصل'}
                                                        {iface.mac && ` · ${iface.mac}`}
                                                    </Typography>
                                                </Box>
                                            </Box>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <Chip
                                                    size="small"
                                                    label={
                                                        iface.method === 'dhcp' ? 'DHCP (تلقائي)' :
                                                        iface.method === 'static' ? 'Static (يدوي)' :
                                                        iface.method === 'shared' ? 'Hotspot' :
                                                        '—'
                                                    }
                                                    color={
                                                        iface.method === 'dhcp' ? 'success' :
                                                        iface.method === 'static' ? 'primary' :
                                                        iface.method === 'shared' ? 'warning' :
                                                        'default'
                                                    }
                                                    variant="outlined"
                                                />
                                                {iface.ipv4 && (
                                                    <Chip size="small" label={iface.ipv4} variant="outlined" />
                                                )}
                                                <SettingsIcon sx={{ color: 'text.secondary' }} />
                                            </Box>
                                        </Box>

                                        <Collapse in={expandedIface === iface.name}>
                                            <Divider sx={{ my: 2 }} />
                                            {!helperAvailable && (
                                                <Alert severity="info" sx={{ mb: 2 }}>
                                                    لتطبيق الإعدادات يرجى تشغيل الخدمة الوسيطة: <strong>sudo systemctl start zero-network-helper</strong>
                                                </Alert>
                                            )}
                                            {saveError && (
                                                <Alert severity="error" sx={{ mb: 2 }} onClose={() => setSaveError(null)}>
                                                    {saveError}
                                                </Alert>
                                            )}
                                            {saveSuccess === iface.name && (
                                                <Alert severity="success" sx={{ mb: 2 }}>
                                                    تم تطبيق الإعدادات بنجاح.
                                                </Alert>
                                            )}
                                            <ToggleButtonGroup
                                                value={form.method}
                                                exclusive
                                                onChange={(e, v) => v && setForm((f) => ({ ...f, method: v }))}
                                                size="small"
                                                sx={{ mb: 2 }}
                                            >
                                                <ToggleButton value="dhcp">DHCP (تلقائي)</ToggleButton>
                                                <ToggleButton value="static">Static (يدوي)</ToggleButton>
                                            </ToggleButtonGroup>

                                            {form.method === 'static' && (
                                                <Grid container spacing={2} sx={{ mb: 2 }}>
                                                    <Grid item xs={12} sm={6} md={3}>
                                                        <TextField
                                                            fullWidth
                                                            size="small"
                                                            label="عنوان IPv4"
                                                            value={form.address || ''}
                                                            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                                                            placeholder="192.168.1.100"
                                                        />
                                                    </Grid>
                                                    <Grid item xs={12} sm={6} md={2}>
                                                        <TextField
                                                            fullWidth
                                                            size="small"
                                                            type="number"
                                                            label="البادئة (Prefix)"
                                                            value={form.prefix ?? 24}
                                                            onChange={(e) => setForm((f) => ({ ...f, prefix: parseInt(e.target.value, 10) || 24 }))}
                                                            inputProps={{ min: 1, max: 32 }}
                                                        />
                                                    </Grid>
                                                    <Grid item xs={12} sm={6} md={3}>
                                                        <TextField
                                                            fullWidth
                                                            size="small"
                                                            label="البوابة (Gateway)"
                                                            value={form.gateway || ''}
                                                            onChange={(e) => setForm((f) => ({ ...f, gateway: e.target.value }))}
                                                            placeholder="192.168.1.1"
                                                        />
                                                    </Grid>
                                                    <Grid item xs={12} sm={6} md={3}>
                                                        <TextField
                                                            fullWidth
                                                            size="small"
                                                            label="DNS"
                                                            value={form.dns || ''}
                                                            onChange={(e) => setForm((f) => ({ ...f, dns: e.target.value }))}
                                                            placeholder="8.8.8.8"
                                                        />
                                                    </Grid>
                                                </Grid>
                                            )}

                                            <Button
                                                variant="contained"
                                                startIcon={saving === iface.name ? <CircularProgress size={18} /> : <SaveIcon />}
                                                onClick={() => handleSave(iface.name)}
                                                disabled={!helperAvailable || saving === iface.name || (form.method === 'static' && !form.address)}
                                            >
                                                {saving === iface.name ? 'جاري التطبيق...' : 'تطبيق الإعدادات'}
                                            </Button>
                                        </Collapse>
                                    </CardContent>
                                </Card>
                            </Grid>
                            {/* Hotspot card appears right after the WiFi interface */}
                            {iface.type === 'wifi' && wifiInterface?.name === iface.name && (
                                <Grid item xs={12}>
                                    {hotspotCard}
                                </Grid>
                            )}
                        </React.Fragment>
                    ))}
                    {/* Fallback: show hotspot at end if no wifi interface found */}
                    {!wifiInterface && (
                        <Grid item xs={12}>
                            {hotspotCard}
                        </Grid>
                    )}
                </Grid>
            )}

            {/* === Project Port Section === */}
            <Divider sx={{ my: 3 }} />
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="h6">منفذ المشروع</Typography>
            </Box>
            <Card variant="outlined">
                <CardContent>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        المنفذ الذي يعمل عليه السيرفر (الحالي: {projectPort || '...'}). تغيير المنفذ سيتطلب إعادة تشغيل الخدمة.
                    </Typography>
                    {projectPortError && (
                        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setProjectPortError(null)}>
                            {projectPortError}
                        </Alert>
                    )}
                    {projectPortSuccess && (
                        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setProjectPortSuccess(null)}>
                            {projectPortSuccess}
                        </Alert>
                    )}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                        <TextField
                            size="small"
                            type="number"
                            label="المنفذ"
                            value={projectPortInput}
                            onChange={(e) => setProjectPortInput(e.target.value)}
                            inputProps={{ min: 1, max: 65535 }}
                            sx={{ width: 150 }}
                            disabled={projectPortLoading || projectPortSaving}
                        />
                        <Button
                            variant="contained"
                            startIcon={projectPortSaving ? <CircularProgress size={18} /> : <SaveIcon />}
                            onClick={handlePortSave}
                            disabled={
                                projectPortLoading ||
                                projectPortSaving ||
                                !helperAvailable ||
                                !projectPortInput ||
                                String(projectPortInput) === projectPort
                            }
                        >
                            {projectPortSaving ? 'جاري التطبيق...' : 'تغيير المنفذ'}
                        </Button>
                    </Box>
                    {!helperAvailable && (
                        <Alert severity="info" sx={{ mt: 2 }}>
                            لتغيير المنفذ يرجى تشغيل الخدمة الوسيطة: <strong>sudo systemctl start zero-network-helper</strong>
                        </Alert>
                    )}
                </CardContent>
            </Card>

            {/* === IP/Port Change Redirect Dialog === */}
            <Dialog
                open={!!redirectInfo}
                onClose={() => {}}
                disableEscapeKeyDown
                maxWidth="sm"
                fullWidth
                PaperProps={{ sx: { direction: 'rtl' } }}
            >
                <DialogTitle sx={{ fontWeight: 700 }}>
                    {redirectInfo?.isPortChange ? 'تم تغيير منفذ المشروع' : 'تم تغيير إعدادات الشبكة'}
                </DialogTitle>
                <DialogContent>
                    {redirectInfo?.isDhcp ? (
                        <Alert severity="info" sx={{ mb: 2 }}>
                            تم التبديل إلى DHCP. سيحصل المنفذ على عنوان جديد تلقائياً.
                            يرجى معرفة العنوان الجديد من الراوتر أو من السيرفر مباشرة ثم فتح الصفحة على العنوان الجديد.
                        </Alert>
                    ) : (
                        <>
                            <Alert severity="success" sx={{ mb: 2 }}>
                                {redirectInfo?.isPortChange
                                    ? `تم تغيير المنفذ. سيتم إعادة تشغيل الخدمة خلال ثوانٍ.`
                                    : 'تم تطبيق الإعدادات بنجاح.'}
                            </Alert>
                            <Typography variant="body1" sx={{ mb: 2 }}>
                                {redirectInfo?.isPortChange
                                    ? 'يرجى الانتقال إلى العنوان الجديد بعد إعادة التشغيل:'
                                    : 'تم تغيير عنوان الواجهة التي تستخدمها حالياً. يرجى الانتقال إلى العنوان الجديد:'}
                            </Typography>
                            <Box
                                sx={{
                                    p: 2, bgcolor: 'grey.100', borderRadius: 2,
                                    fontFamily: 'monospace', fontSize: '1.1rem',
                                    textAlign: 'center', fontWeight: 700,
                                    border: '1px solid', borderColor: 'grey.300',
                                }}
                            >
                                {`http://${redirectInfo?.newIp}:${redirectInfo?.port}/`}
                            </Box>
                        </>
                    )}
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
                    <Button
                        variant="outlined"
                        onClick={() => {
                            setRedirectInfo(null);
                            fetchInterfaces();
                        }}
                    >
                        إغلاق
                    </Button>
                    {!redirectInfo?.isDhcp && redirectInfo?.newIp && (
                        <Button
                            variant="contained"
                            startIcon={<OpenInNewIcon />}
                            onClick={() => {
                                window.location.href = `http://${redirectInfo.newIp}:${redirectInfo.port}/`;
                            }}
                        >
                            فتح العنوان الجديد
                        </Button>
                    )}
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default NetworkTab;
