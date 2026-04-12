import React, { useState, useEffect } from 'react';
import { Box, IconButton, useTheme, useMediaQuery } from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import Navbar from './layout/Navbar';
import Footer from './layout/Footer';
import HeroSection from './hero/HeroSection';
import ServicesSection from './services/ServicesSection';

export default function HomePage() {
    const [services, setServices] = useState([]);
    const [settings, setSettings] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [showScrollToApps, setShowScrollToApps] = useState(false);

    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    // Fetch data on component mount
    useEffect(() => {
        const fetchAllData = async () => {
            try {
                const [servicesRes, settingsRes] = await Promise.all([
                    fetch('/api/services/'),
                    fetch('/api/settings/')
                ]);

                if (!servicesRes.ok || !settingsRes.ok) {
                    throw new Error('Failed to load initial data.');
                }

                const servicesData = await servicesRes.json();
                const settingsData = await settingsRes.json();
                
                setServices(servicesData);
                setSettings(settingsData);
                setError('');
            } catch (err) {
                 console.error('Error fetching data:', err);
                 setError('Could not load page content. Please try again later.');
            } finally {
                setLoading(false);
            }
        };
        fetchAllData();
    }, []);

    // Scroll event listener for floating action button
    useEffect(() => {
        const handleScroll = () => {
            const scrollY = window.scrollY;
            const heroHeight = window.innerHeight * 0.6;
            setShowScrollToApps(scrollY > heroHeight);
        };

        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    // التتبع أصبح عبر رابط الفتح المباشر /open في الباكند
    const handleServiceClick = () => {};

    const scrollToApps = () => {
        const appsSection = document.getElementById('applications-section');
        if (appsSection) {
            appsSection.scrollIntoView({ 
                behavior: 'smooth',
                block: 'start'
            });
        }
    };

    return (
                                <Box sx={{ 
            flexGrow: 1, 
            backgroundColor: '#f8f9fa', 
            position: 'relative',
            minHeight: '100vh',
            paddingTop: 0,
            paddingX: { xs: 1, sm: 2, md: 0 }
        }}>
            {/* Navigation */}
            <Navbar 
                settings={settings}
                drawerOpen={drawerOpen}
                setDrawerOpen={setDrawerOpen}
                onScrollToApps={scrollToApps}
                isMobile={isMobile}
            />

            {/* Hero Section — يمتد لأعلى الصفحة بدون مساحة بيضاء */}
            <HeroSection 
                settings={settings}
                loading={loading}
            />

            {/* سهم النزول — يختفي بعد الوصول لقسم الخدمات (لا يوجد قسم تحته) */}
            <Box
                sx={{
                    position: 'fixed',
                    bottom: 24,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    zIndex: 1000,
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    opacity: showScrollToApps ? 0 : 1,
                    pointerEvents: showScrollToApps ? 'none' : 'auto',
                    transition: 'opacity 0.35s ease'
                }}
            >
                <IconButton
                    onClick={scrollToApps}
                    sx={{
                        color: 'primary.main',
                        '&:hover': { bgcolor: 'rgba(25, 118, 210, 0.08)' },
                        animation: 'arrowFloat 2.5s ease-in-out infinite'
                    }}
                    aria-label="النزول إلى قسم الخدمات"
                >
                    <KeyboardArrowDownIcon sx={{ fontSize: 48 }} />
                </IconButton>
            </Box>

            {/* Services Section */}
            <ServicesSection 
                services={services}
                loading={loading}
                error={error}
                onServiceClick={handleServiceClick}
                showScrollToApps={showScrollToApps}
                onScrollToApps={scrollToApps}
            />

            {/* Footer */}
            <Footer />

            {/* Global CSS Animations */}
            <Box
                component="style"
                dangerouslySetInnerHTML={{
                    __html: `
                        @keyframes float {
                            0%, 100% { transform: translateY(0px); }
                            50% { transform: translateY(-10px); }
                        }
                        @keyframes arrowFloat {
                            0%, 100% { transform: translateY(0); }
                            50% { transform: translateY(-8px); }
                        }
                        
                        @keyframes bounce {
                            0%, 20%, 50%, 80%, 100% { transform: translateX(-50%) translateY(0); }
                            40% { transform: translateX(-50%) translateY(-10px); }
                            60% { transform: translateX(-50%) translateY(-5px); }
                        }
                        
                        @keyframes shimmer {
                            0% { transform: translateX(-100%); }
                            100% { transform: translateX(100%); }
                        }
                        
                        @keyframes slideInUp {
                            0% { transform: translateY(30px); opacity: 0; }
                            100% { transform: translateY(0); opacity: 1; }
                        }
                        
                        @keyframes fadeInScale {
                            0% { transform: scale(0.9); opacity: 0; }
                            100% { transform: scale(1); opacity: 1; }
                        }
                        
                        /* Smooth scrolling for the entire page */
                        html { scroll-behavior: smooth; }
                        
                        /* Custom scrollbar */
                        ::-webkit-scrollbar {
                            width: 8px;
                        }
                        
                        ::-webkit-scrollbar-track {
                            background: #f1f1f1;
                        }
                        
                        ::-webkit-scrollbar-thumb {
                            background: linear-gradient(45deg, #1976d2, #42a5f5);
                            border-radius: 4px;
                        }
                        
                        ::-webkit-scrollbar-thumb:hover {
                            background: linear-gradient(45deg, #1565c0, #1976d2);
                        }
                    `
                }}
            />
        </Box>
    );
} 