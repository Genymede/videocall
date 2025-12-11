import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, onValue, set, remove } from 'firebase/database';
import { Plus, Trash2, Building2, AlertCircle, Loader2, Search, CheckCircle2, MapPin, Eye, X } from 'lucide-react';
import Swal from 'sweetalert2'; // ต้องติดตั้งก่อน: npm install sweetalert2

// Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyD6GeERDZY8FQnRkr4oT4AqQIdOhypn-V0",
  authDomain: "peerjs-video-call.firebaseapp.com",
  databaseURL: "https://peerjs-video-call-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "peerjs-video-call",
  storageBucket: "peerjs-video-call.firebasestorage.app",
  messagingSenderId: "418405695038",
  appId: "1:418405695038:web:aa91dd36916887a0f05b6f",
  measurementId: "G-KPGVR14LP1"
};

const app = initializeApp(firebaseConfig, 'location-settings');
const database = getDatabase(app);

// สร้าง ID สุ่ม
const generateLocationId = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = 'loc_';
  for (let i = 0; i < 10; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

const LocationSettings = ({ onClose, onSelectLocation }) => {
  const [locations, setLocations] = useState([]);
  const [filteredLocations, setFilteredLocations] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [showConfirmDelete, setShowConfirmDelete] = useState(null);
  const [showDetails, setShowDetails] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [adding, setAdding] = useState(false);

  // ฟอร์มใน Modal
  const [form, setForm] = useState({
    name: '',
    houseNo: '',
    moo: '',
    soi: '',
    road: '',
    subDistrict: '',
    district: '',
    province: '',
    postcode: ''
  });

  // Realtime Listener
  useEffect(() => {
    const rootRef = ref(database);

    const unsubscribe = onValue(rootRef, (snapshot) => {
      const data = snapshot.val() || {};
      const locationList = [];

      Object.keys(data).forEach(key => {
        const value = data[key];
        if (value && typeof value === 'object' && value.name) {
          locationList.push({
            id: key,
            ...value
          });
        }
      });

      setLocations(locationList);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // ค้นหา + เรียงลำดับ
  useEffect(() => {
    let filtered = [...locations];

    if (searchTerm.trim()) {
      filtered = filtered.filter(loc =>
        loc.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (loc.address?.province && loc.address.province.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (loc.address?.district && loc.address.district.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }

    filtered.sort((a, b) => {
      if (sortBy === 'newest') return (b.createdAt || 0) - (a.createdAt || 0);
      if (sortBy === 'oldest') return (a.createdAt || 0) - (b.createdAt || 0);
      if (sortBy === 'az') return a.name.localeCompare(b.name, 'th');
      return 0;
    });

    setFilteredLocations(filtered);
  }, [locations, searchTerm, sortBy]);

  // เพิ่มสถานที่
  const addLocation = async () => {
    if (!form.name.trim()) {
      setError('กรุณากรอกชื่อโรงพยาบาล');
      return;
    }

    if (locations.some(loc => loc.name === form.name.trim())) {
      setError('มีชื่อโรงพยาบาลนี้อยู่แล้ว');
      return;
    }

    setAdding(true);
    setError('');

    let locationId = generateLocationId();
    let attempts = 0;

    while (attempts < 5) {
      try {
        const locationRef = ref(database, locationId);
        await set(locationRef, {
          name: form.name.trim(),
          address: {
            houseNo: form.houseNo.trim(),
            moo: form.moo.trim(),
            soi: form.soi.trim(),
            road: form.road.trim(),
            subDistrict: form.subDistrict.trim(),
            district: form.district.trim(),
            province: form.province.trim(),
            postcode: form.postcode.trim()
          },
          createdAt: Date.now()
        });

        setForm({
          name: '', houseNo: '', moo: '', soi: '', road: '',
          subDistrict: '', district: '', province: '', postcode: ''
        });
        setShowAddModal(false);
        setAdding(false);
        setError('');
        return;
      } catch (err) {
        locationId = generateLocationId();
        attempts++;
      }
    }

    setError('ไม่สามารถเพิ่มได้ ลองใหม่');
    setAdding(false);
  };

  // ลบสถานที่
  const deleteLocation = async (locationId) => {
    try {
      await remove(ref(database, locationId));
      setShowConfirmDelete(null);
    } catch (err) {
      setError('ไม่สามารถลบได้');
    }
  };

  // เลือกสถานที่ - ใช้ SweetAlert2 + เก็บใน localStorage
  const handleSelectLocation = (location) => {
    Swal.fire({
      title: 'ยืนยันการเลือกสถานที่',
      html: `
        <div class="text-left">
          <p class="font-semibold text-lg">${location.name}</p>
          ${location.address?.province ? `<p class="text-sm text-gray-600 mt-2">${location.address.province} ${location.address.district ? `- ${location.address.district}` : ''}</p>` : ''}
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'เลือกสถานที่นี้',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#4f46e5',
      cancelButtonColor: '#6b7280',
      reverseButtons: true,
    }).then((result) => {
      if (result.isConfirmed) {
        // เก็บลง localStorage
        localStorage.setItem('selectedLocation', JSON.stringify(location));

        Swal.fire({
          title: 'เลือกสำเร็จ!',
          text: `คุณได้เลือก "${location.name}" เป็นสถานที่ใช้งาน`,
          icon: 'success',
          confirmButtonText: 'ตกลง',
          confirmButtonColor: '#4f46e5',
          timer: 2000,
          timerProgressBar: true
        }).then(() => {
          if (onSelectLocation) onSelectLocation(location);
          onClose?.();
        });
      }
    });
  };

  return (
    <>
      <div className="fixed inset-0 bg-gradient-to-br from-indigo-50 to-purple-100 flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="bg-white shadow-lg px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <Building2 className="w-8 h-8 text-indigo-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-800">จัดการสถานที่</h1>
              <p className="text-sm text-gray-600">ค้นหา, เรียงลำดับ, เพิ่ม, ดูรายละเอียด และเลือกสถานที่</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 transition p-2">
            <X className="w-8 h-8" />
          </button>
        </div>

        {/* Search + Sort + Add Button */}
        <div className="bg-white border-b px-6 py-4 flex-shrink-0">
          <div className="max-w-4xl mx-auto flex flex-col sm:flex-row gap-4 items-end">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="ค้นหาชื่อโรงพยาบาล, จังหวัด..."
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              <option value="newest">ใหม่ที่สุด</option>
              <option value="oldest">เก่าที่สุด</option>
              <option value="az">A-Z</option>
            </select>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition flex items-center gap-2 whitespace-nowrap"
            >
              <Plus className="w-5 h-5" />
              เพิ่มสถานที่ใหม่
            </button>
          </div>
        </div>

        {/* Body - รายการสถานที่ */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl mx-auto">
            {loading ? (
              <div className="text-center py-12">
                <Loader2 className="animate-spin w-8 h-8 mx-auto text-indigo-600" />
                <p className="mt-3 text-gray-600">กำลังโหลด...</p>
              </div>
            ) : filteredLocations.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Building2 className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                <p>{searchTerm ? 'ไม่พบสถานที่ที่ค้นหา' : 'ยังไม่มีสถานที่ใด ๆ'}</p>
                <p className="text-sm mt-2">กดปุ่ม "เพิ่มสถานที่ใหม่" เพื่อเริ่มต้น</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredLocations.map((loc) => (
                  <div key={loc.id} className="bg-white rounded-2xl shadow-lg hover:shadow-xl transition p-6 border border-gray-200">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <Building2 className="w-10 h-10 text-indigo-600" />
                          <h3 className="font-bold text-lg text-gray-800">{loc.name}</h3>
                        </div>
                        {loc.address?.province && (
                          <p className="text-sm text-gray-600 mt-2 flex items-center gap-1">
                            <MapPin className="w-4 h-4" />
                            {loc.address.province} {loc.address.district && `- ${loc.address.district}`}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => setShowConfirmDelete(loc)}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50 p-2 rounded-lg transition"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>

                    <div className="flex gap-3">
                      <button
                        onClick={() => setShowDetails(loc)}
                        className="flex-1 bg-gray-600 hover:bg-gray-700 text-white py-2.5 rounded-lg text-sm font-medium transition flex items-center justify-center gap-2"
                      >
                        <Eye className="w-4 h-4" />
                        ดูรายละเอียด
                      </button>
                      <button
                        onClick={() => handleSelectLocation(loc)}
                        className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-lg text-sm font-medium transition flex items-center justify-center gap-2"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        เลือก
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Modal เพิ่มสถานที่ใหม่ */}
        {showAddModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-screen overflow-y-auto p-8">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
                  <Plus className="w-8 h-8 text-green-600" />
                  เพิ่มสถานที่ใหม่
                </h2>
                <button onClick={() => {
                  setShowAddModal(false);
                  setError('');
                  setForm({
                    name: '', houseNo: '', moo: '', soi: '', road: '',
                    subDistrict: '', district: '', province: '', postcode: ''
                  });
                }} className="text-gray-500 hover:text-gray-700">
                  <X className="w-8 h-8" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">ชื่อโรงพยาบาล *</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({...form, name: e.target.value})}
                    placeholder="เช่น โรงพยาบาลกรุงเทพ"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">เลขที่</label>
                  <input type="text" value={form.houseNo} onChange={(e) => setForm({...form, houseNo: e.target.value})} className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">หมู่</label>
                  <input type="text" value={form.moo} onChange={(e) => setForm({...form, moo: e.target.value})} className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">ซอย</label>
                  <input type="text" value={form.soi} onChange={(e) => setForm({...form, soi: e.target.value})} className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">ถนน</label>
                  <input type="text" value={form.road} onChange={(e) => setForm({...form, road: e.target.value})} className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">แขวง/ตำบล</label>
                  <input type="text" value={form.subDistrict} onChange={(e) => setForm({...form, subDistrict: e.target.value})} className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">เขต/อำเภอ</label>
                  <input type="text" value={form.district} onChange={(e) => setForm({...form, district: e.target.value})} className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">จังหวัด</label>
                  <input type="text" value={form.province} onChange={(e) => setForm({...form, province: e.target.value})} className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">รหัสไปรษณีย์</label>
                  <input type="text" value={form.postcode} onChange={(e) => setForm({...form, postcode: e.target.value})} className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
              </div>

              {error && (
                <div className="mt-5 text-red-600 text-sm flex items-center gap-2">
                  <AlertCircle className="w-5 h-5" />
                  {error}
                </div>
              )}

              <div className="mt-8 flex justify-end gap-4">
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    setError('');
                    setForm({ name: '', houseNo: '', moo: '', soi: '', road: '', subDistrict: '', district: '', province: '', postcode: '' });
                  }}
                  className="px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg transition"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={addLocation}
                  disabled={adding || !form.name.trim()}
                  className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white font-medium rounded-lg transition flex items-center gap-2"
                >
                  {adding ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                  {adding ? 'กำลังเพิ่ม...' : 'บันทึกสถานที่'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal รายละเอียดที่อยู่ */}
        {showDetails && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-2xl w-full max-h-screen overflow-y-auto">
              <div className="flex justify-between items-start mb-6">
                <h3 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
                  <Building2 className="w-10 h-10 text-indigo-600" />
                  {showDetails.name}
                </h3>
                <button onClick={() => setShowDetails(null)} className="text-gray-500 hover:text-gray-700">
                  <X className="w-8 h-8" />
                </button>
              </div>
              <div className="space-y-4 text-gray-700">
                <div className="flex items-start gap-3">
                  <MapPin className="w-6 h-6 text-indigo-600 mt-1 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-lg">ที่อยู่เต็ม</p>
                    <p className="mt-1 leading-relaxed">
                      {[
                        showDetails.address?.houseNo && `${showDetails.address.houseNo}`,
                        showDetails.address?.moo && `หมู่ ${showDetails.address.moo}`,
                        showDetails.address?.soi && `ซอย ${showDetails.address.soi}`,
                        showDetails.address?.road && `ถนน ${showDetails.address.road}`
                      ].filter(Boolean).join(' ')}
                      {showDetails.address?.subDistrict && ` แขวง/ตำบล ${showDetails.address.subDistrict}`}
                      {showDetails.address?.district && ` เขต/อำเภอ ${showDetails.address.district}`}
                      {showDetails.address?.province && ` จังหวัด${showDetails.address.province}`}
                      {showDetails.address?.postcode && ` ${showDetails.address.postcode}`}
                    </p>
                  </div>
                </div>
              </div>
              <div className="mt-8 flex justify-end">
                <button onClick={() => setShowDetails(null)} className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg">
                  ปิด
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Confirm Delete */}
        {showConfirmDelete && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full">
              <h3 className="text-xl font-bold text-gray-800 mb-4">ยืนยันการลบ</h3>
              <p className="text-gray-700 mb-6">
                ลบ <strong className="text-red-600">"{showConfirmDelete.name}"</strong> อย่างถาวร?
              </p>
              <div className="flex gap-3 justify-end">
                <button onClick={() => setShowConfirmDelete(null)} className="px-5 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg">
                  ยกเลิก
                </button>
                <button onClick={() => deleteLocation(showConfirmDelete.id)} className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg">
                  ลบ
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        html, body, #root, #__next {
          margin: 0; padding: 0; height: 100%; width: 100%; overflow: hidden;
        }
      `}} />
    </>
  );
};

export default LocationSettings;