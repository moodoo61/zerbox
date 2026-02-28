import React, { useState, useEffect } from 'react';

export default function HomePage() {
  const [services, setServices] = useState([]);

  useEffect(() => {
    fetch('/api/services/') // Reverted to relative path for proxy
      .then(response => response.json())
      .then(data => setServices(data))
      .catch(error => console.error('Error fetching services:', error));
  }, []);

  const handleServiceClick = (serviceId) => {
    fetch(`/api/services/${serviceId}/click`, { method: 'POST' }) // Reverted to relative path
      .catch(error => console.error('Error incrementing click count:', error));
  };

  return (
    <>
      <header className="bg-blue-600 text-white text-center p-8">
        <h1 className="text-4xl font-bold">مرحبًا بكم في المنصة الترفيهية والخدمية</h1>
      </header>

      <main className="p-8">
        <div className="text-center mb-8">
          <a href="/admin" className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded">
            الانتقال إلى لوحة التحكم
          </a>
        </div>

        {services.length === 0 ? (
          <p className="text-center text-gray-500">لا توجد خدمات لعرضها حاليًا. قم بإضافتها من لوحة التحكم.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {services.map(service => (
              <div key={service.id} className="bg-white rounded-lg shadow-md overflow-hidden transform hover:scale-105 transition-transform duration-300">
                <img src={service.image_url || 'https://via.placeholder.com/400x200'} alt={service.name} className="w-full h-48 object-cover" />
                <div className="p-6">
                  <h2 className="text-2xl font-bold mb-2">{service.name}</h2>
                  <a
                    href={service.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => handleServiceClick(service.id)}
                    className="inline-block bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition-colors duration-300"
                  >
                    الذهاب إلى الخدمة &rarr;
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
} 