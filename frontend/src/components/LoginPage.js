import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box,
    Paper,
    Typography,
    TextField,
    Button,
    Alert,
    InputAdornment,
    IconButton,
} from '@mui/material';
import { Visibility, VisibilityOff, Login as LoginIcon } from '@mui/icons-material';

const LoginPage = ({ setAuth }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const getErrorMessage = (response, err) => {
        if (response && response.detail) {
            if (typeof response.detail === 'string') return response.detail;
            if (Array.isArray(response.detail)) {
                const msg = response.detail.map(d => d.msg || d).join(' ');
                return msg || 'حدث خطأ في البيانات المدخلة.';
            }
        }
        if (response?.status === 401) return 'اسم المستخدم أو كلمة المرور غير صحيحة.';
        if (response?.status === 503) return 'حساب المدير غير مُعد. يرجى مراجعة الإعدادات.';
        if (err?.message === 'Failed to fetch' || err?.message?.includes('NetworkError'))
            return 'تعذّر الاتصال بالخادم. تحقق من الاتصال ثم أعد المحاولة.';
        return 'فشل تسجيل الدخول. يرجى المحاولة مرة أخرى.';
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });

            let responseData = {};
            try {
                responseData = await response.json();
            } catch (_) {}

            if (response.ok && responseData.token) {
                setAuth(responseData.token);
                navigate('/admin');
                return;
            }

            setError(getErrorMessage({ ...responseData, status: response.status }));
        } catch (err) {
            setError(getErrorMessage(null, err));
        } finally {
            setLoading(false);
        }
    };

    return (
        <Box
            sx={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: 'background.default',
                py: 3,
                px: 2,
            }}
        >
            <Paper
                elevation={3}
                sx={{
                    width: '100%',
                    maxWidth: 420,
                    p: 4,
                    borderRadius: 3,
                    direction: 'rtl',
                    '& .MuiInputBase-input': { textAlign: 'right', direction: 'rtl' },
                    '& .MuiInputLabel-root': { right: 14, left: 'auto' },
                    '& .MuiInputLabel-shrink': { transformOrigin: 'top right' },
                    '& .MuiOutlinedInput-notchedOutline': { textAlign: 'right' },
                }}
            >
                <Box sx={{ textAlign: 'center', mb: 3 }}>
                    <Box
                        component="img"
                        src="/zerolag-logo.png"
                        alt="ZEROLAG"
                        sx={{
                            height: 72,
                            width: 'auto',
                            maxWidth: 200,
                            mb: 1.5,
                            display: 'block',
                            marginLeft: 'auto',
                            marginRight: 'auto',
                            objectFit: 'contain',
                        }}
                    />
                    <Typography variant="h5" fontWeight={700} color="text.primary" gutterBottom>
                        لوحة التحكم
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        تسجيل الدخول لإدارة المنصة
                    </Typography>
                </Box>

                <Box component="form" onSubmit={handleLogin} noValidate>
                    {error && (
                        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
                            {error}
                        </Alert>
                    )}

                    <TextField
                        label="اسم المستخدم"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        fullWidth
                        required
                        autoComplete="username"
                        margin="normal"
                        autoFocus
                        sx={{ mb: 1 }}
                    />
                    <TextField
                        label="كلمة المرور"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        fullWidth
                        required
                        autoComplete="current-password"
                        margin="normal"
                        InputProps={{
                            endAdornment: (
                                <InputAdornment position="end">
                                    <IconButton
                                        aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                                        onClick={() => setShowPassword(!showPassword)}
                                        edge="end"
                                    >
                                        {showPassword ? <VisibilityOff /> : <Visibility />}
                                    </IconButton>
                                </InputAdornment>
                            ),
                        }}
                        sx={{ mb: 2 }}
                    />

                    <Button
                        type="submit"
                        variant="contained"
                        fullWidth
                        size="large"
                        disabled={loading}
                        startIcon={loading ? null : <LoginIcon />}
                        sx={{ py: 1.5, borderRadius: 2, fontWeight: 600 }}
                    >
                        {loading ? 'جاري تسجيل الدخول...' : 'دخول'}
                    </Button>
                </Box>
            </Paper>
        </Box>
    );
};

export default LoginPage;
