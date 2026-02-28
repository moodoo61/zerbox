import React, { useState, useEffect } from 'react';
import Modal from './Modal'; // Import the Modal component

// This is a placeholder for the Service Manager component.
// We will build this out in the next steps.
export default function ServiceManager({ auth }) {
    const [services, setServices] = useState([]);
    const [error, setError] = useState('');
    const [isModalOpen, setModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState('add'); // 'add' or 'edit'
    const [currentService, setCurrentService] = useState({ id: null, name: '', link: '', image_url: '' });

    const fetchServices = () => {
        const headers = new Headers();
        headers.set('Authorization', 'Basic ' + auth);

        fetch('/api/services/', { headers })
            .then(response => {
                if (!response.ok) throw new Error('Failed to fetch services.');
                return response.json();
            })
            .then(data => setServices(data))
            .catch(err => setError(err.message));
    };

    useEffect(() => {
        if (auth) {
            fetchServices();
        }
    }, [auth]);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setCurrentService(prevState => ({ ...prevState, [name]: value }));
    };

    const openAddModal = () => {
        setModalMode('add');
        setCurrentService({ id: null, name: '', link: '', image_url: '' });
        setModalOpen(true);
    };

    const openEditModal = (service) => {
        setModalMode('edit');
        setCurrentService(service);
        setModalOpen(true);
    };

    const handleFormSubmit = (e) => {
        e.preventDefault();
        if (modalMode === 'add') {
            handleAddService();
        } else {
            handleUpdateService();
        }
    };

    const handleAddService = () => {
        const headers = new Headers();
        headers.set('Authorization', 'Basic ' + auth);
        headers.set('Content-Type', 'application/json');

        fetch('/api/services/', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(currentService)
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to add service.');
            }
            return response.json();
        })
        .then(() => {
            fetchServices();
            setModalOpen(false);
        })
        .catch(err => setError(err.message));
    };

    const handleUpdateService = () => {
        const { id, ...serviceData } = currentService;
        const headers = new Headers();
        headers.set('Authorization', 'Basic ' + auth);
        headers.set('Content-Type', 'application/json');

        fetch(`/api/services/${id}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify(serviceData)
        })
        .then(response => {
            if (!response.ok) throw new Error('Failed to update service.');
            return response.json();
        })
        .then(() => {
            fetchServices();
            setModalOpen(false);
        })
        .catch(err => setError(err.message));
    };

    const handleDelete = (serviceId) => {
        if (!window.confirm('هل أنت متأكد من أنك تريد حذف هذه الخدمة؟')) {
            return;
        }

        const headers = new Headers();
        headers.set('Authorization', 'Basic ' + auth);

        fetch(`/api/services/${serviceId}`, {
            method: 'DELETE',
            headers: headers,
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to delete service.');
            }
            fetchServices();
        })
        .catch(err => setError(err.message));
    };

    if (error) return <p className="text-red-500">{error}</p>;

    return (
        <div>
            <h3 className="text-xl font-bold mb-4">قائمة الخدمات</h3>
            <div className="mb-4">
                <button onClick={openAddModal} className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">
                    + إضافة خدمة جديدة
                </button>
            </div>

            <Modal isVisible={isModalOpen} onClose={() => setModalOpen(false)} title={modalMode === 'add' ? 'إضافة خدمة جديدة' : 'تعديل الخدمة'}>
                <form onSubmit={handleFormSubmit}>
                    <div className="mb-4">
                        <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="name">
                            اسم الخدمة
                        </label>
                        <input type="text" name="name" id="name" value={currentService.name} onChange={handleInputChange} className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" required />
                    </div>
                    <div className="mb-4">
                        <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="link">
                            رابط الخدمة
                        </label>
                        <input type="url" name="link" id="link" value={currentService.link} onChange={handleInputChange} className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" required />
                    </div>
                    <div className="mb-4">
                        <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="image_url">
                            رابط صورة الخدمة
                        </label>
                        <input type="url" name="image_url" id="image_url" value={currentService.image_url} onChange={handleInputChange} className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" />
                    </div>
                    <div className="flex items-center justify-end">
                        <button type="submit" className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded">
                            {modalMode === 'add' ? 'إضافة' : 'تحديث'}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Services Table */}
            <div className="overflow-x-auto">
                <table className="min-w-full bg-white">
                    <thead className="bg-gray-800 text-white">
                        <tr>
                            <th className="text-right py-3 px-4 uppercase font-semibold text-sm">الاسم</th>
                            <th className="text-right py-3 px-4 uppercase font-semibold text-sm">الرابط</th>
                            <th className="text-center py-3 px-4 uppercase font-semibold text-sm">النقرات</th>
                            <th className="text-center py-3 px-4 uppercase font-semibold text-sm">إجراءات</th>
                        </tr>
                    </thead>
                    <tbody className="text-gray-700">
                        {services.length > 0 ? (
                            services.map(service => (
                                <tr key={service.id}>
                                    <td className="text-right py-3 px-4">{service.name}</td>
                                    <td className="text-right py-3 px-4"><a href={service.link} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">{service.link}</a></td>
                                    <td className="text-center py-3 px-4">{service.click_count}</td>
                                    <td className="text-center py-3 px-4">
                                        <button onClick={() => openEditModal(service)} className="bg-yellow-500 hover:bg-yellow-700 text-white px-2 py-1 rounded text-sm mr-2">تعديل</button>
                                        <button onClick={() => handleDelete(service.id)} className="bg-red-500 hover:bg-red-700 text-white px-2 py-1 rounded text-sm">حذف</button>
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan="4" className="text-center py-4">لا توجد خدمات.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
} 