// CSS animations and shared styles
export const keyframes = {
  float: {
    '0%, 100%': { transform: 'translateY(0px)' },
    '50%': { transform: 'translateY(-10px)' }
  },
  bounce: {
    '0%, 20%, 50%, 80%, 100%': { transform: 'translateX(-50%) translateY(0)' },
    '40%': { transform: 'translateX(-50%) translateY(-10px)' },
    '60%': { transform: 'translateX(-50%) translateY(-5px)' }
  },
  shimmer: {
    '0%': { transform: 'translateX(-100%)' },
    '100%': { transform: 'translateX(100%)' }
  },
  slideInUp: {
    '0%': { transform: 'translateY(30px)', opacity: 0 },
    '100%': { transform: 'translateY(0)', opacity: 1 }
  },
  fadeInScale: {
    '0%': { transform: 'scale(0.9)', opacity: 0 },
    '100%': { transform: 'scale(1)', opacity: 1 }
  }
};

// Helper function to convert hex and opacity to rgba
export const hexToRgba = (hex, opacity) => {
  if (!/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)) return hex;
  let c = hex.substring(1).split('');
  if (c.length === 3) {
    c = [c[0], c[0], c[1], c[1], c[2], c[2]];
  }
  c = '0x' + c.join('');
  return `rgba(${[(c >> 16) & 255, (c >> 8) & 255, c & 255].join(',')},${opacity})`;
};

// Shared transition styles
export const transitions = {
  smooth: 'all 0.3s ease',
  hover: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
  bounce: 'all 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55)'
};

// Shared shadow styles
export const shadows = {
  card: '0 4px 12px rgba(0,0,0,0.1)',
  cardHover: '0 12px 30px rgba(0,0,0,0.15)',
  float: '0 8px 25px rgba(0,0,0,0.2)',
  navbar: '0 2px 20px rgba(0,0,0,0.1)'
};
