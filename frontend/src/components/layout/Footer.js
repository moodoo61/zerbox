import React from 'react';
import {
    Box, Container, Typography, IconButton
} from '@mui/material';
import PhoneIcon from '@mui/icons-material/Phone';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import TelegramIcon from '@mui/icons-material/Telegram';

const Footer = () => {
    const contactInfo = [
        {
            icon: PhoneIcon,
            label: 'الهاتف',
            value: '+967 771 601 616',
            color: '#4caf50'
        },
        {
            icon: WhatsAppIcon,
            label: 'واتساب',
            value: '+967 771 601 616',
            color: '#25d366'
        },
        {
            icon: TelegramIcon,
            label: 'تليجرام',
            value: '@platform_support',
            color: '#0088cc'
        }
    ];

    return (
        <Box
            component="footer"
            sx={{
                background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
                color: 'white',
                py: 4,
                mt: 6,
                position: 'relative',
                overflow: 'hidden',
                '&::before': {
                    content: '""',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'linear-gradient(45deg, rgba(255,255,255,0.05) 0%, transparent 50%, rgba(255,255,255,0.05) 100%)',
                    pointerEvents: 'none'
                }
            }}
        >
            <Container maxWidth="md" sx={{ position: 'relative', zIndex: 1 }}>
                {/* Compact Layout */}
                <Box sx={{
                    display: 'flex',
                    flexDirection: { xs: 'column', md: 'row' },
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 3
                }}>
                    {/* Developer Info */}
                    <Box sx={{ textAlign: { xs: 'center', md: 'right' } }}>
                        <Typography variant="h6" sx={{
                            fontWeight: 'bold',
                            mb: 0.5,
                            background: 'linear-gradient(45deg, #64b5f6, #90caf9)',
                            backgroundClip: 'text',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            fontSize: '1.1rem'
                        }}>
                            ZeroLAG
                        </Typography>
                        <Typography variant="body2" sx={{ 
                            opacity: 0.8,
                            fontSize: '0.85rem'
                        }}>
                           نجعل للشبكات بعداً آخر
                        </Typography>
                    </Box>

                    {/* Contact Icons - Horizontal */}
                    <Box sx={{
                        display: 'flex',
                        gap: 2,
                        justifyContent: 'center',
                        flexWrap: 'wrap'
                    }}>
                        {contactInfo.map((contact, index) => {
                            const IconComponent = contact.icon;
                            return (
                                <Box
                                    key={index}
                                    sx={{
                                        position: 'relative',
                                        group: 'contact'
                                    }}
                                >
                                    <IconButton
                                        sx={{
                                            backgroundColor: 'rgba(255,255,255,0.1)',
                                            color: contact.color,
                                            width: 40,
                                            height: 40,
                                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                            border: `2px solid ${contact.color}30`,
                                            '&:hover': {
                                                backgroundColor: contact.color,
                                                color: 'white',
                                                transform: 'translateY(-3px) scale(1.1)',
                                                boxShadow: `0 8px 25px ${contact.color}40`
                                            }
                                        }}
                                        title={`${contact.label}: ${contact.value}`}
                                    >
                                        <IconComponent sx={{ fontSize: 18 }} />
                                    </IconButton>
                                </Box>
                            );
                        })}
                    </Box>

                    {/* Copyright */}
                    <Box sx={{ textAlign: { xs: 'center', md: 'left' } }}>
                        <Typography variant="body2" sx={{ 
                            opacity: 0.7,
                            fontSize: '0.8rem'
                        }}>
                            © {new Date().getFullYear()}
                        </Typography>
                        <Typography variant="body2" sx={{ 
                            opacity: 0.7,
                            fontSize: '0.75rem'
                        }}>
                            تطوير م.محمد فؤاد
                        </Typography>
                    </Box>
                </Box>
            </Container>
        </Box>
    );
};

export default Footer;
