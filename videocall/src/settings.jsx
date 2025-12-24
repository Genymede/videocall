// src/settings.jsx
import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Building2, AlertCircle, Loader2, Search, CheckCircle2, MapPin, Eye, X, Settings as SettingsIcon } from 'lucide-react';

import { database } from './firebase';
import { ref, onValue, set, remove } from 'firebase/database';

const generateLocationId = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = 'loc_';
  for (let i = 0; i < 10; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

const Settings = ({ onClose, onSelectLocation }) => {
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
            name: value.name,
            address: value.address || {},
            createdAt: value.createdAt || 0
          });
        }
      });

      setLocations(locationList);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let filtered = [...locations];

    if (searchTerm.trim()) {
      filtered = filtered.filter(loc =>
        loc.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (loc.address.province && loc.address.province.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (loc.address.district && loc.address.district.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }

    filtered.sort((a, b) => {
      if (sortBy === 'newest') return b.createdAt - a.createdAt;
      if (sortBy === 'oldest') return a.createdAt - b.createdAt;
      if (sortBy === 'az') return a.name.localeCompare(b.name, 'th');
      return 0;
    });

    setFilteredLocations(filtered);
  }, [locations, searchTerm, sortBy]);

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
        return;
      } catch (err) {
        locationId = generateLocationId();
        attempts++;
      }
    }

    setError('ไม่สามารถเพิ่มได้ ลองใหม่');
    setAdding(false);
  };

  const deleteLocation = async (locationId) => {
    try {
      await remove(ref(database, locationId));
      setShowConfirmDelete(null);
    } catch (err) {
      setError('ไม่สามารถลบได้');
    }
  };

  const handleSelectLocation = (location) => {
    onSelectLocation(location); // <-- สำคัญมาก! ส่งสถานที่กลับไป host.jsx
    onClose(); // ปิด modal
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-y-auto p-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-5xl font-bold text-gray-800 flex items-center gap-6">
            <SettingsIcon className="w-16 h-16 text-emerald-600" />
            ตั้งค่าสถานที่
          </h1>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="w-12 h-12" />
          </button>
        </div>

        {/* ค้นหา + เรียง + เพิ่ม */}
        <div className="flex flex-col lg:flex-row gap-6 mb-8">
          <div className="flex-1 relative">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-8 h-8 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ค้นหาชื่อสถานที่..."
              className="w-full pl-16 pr-6 py-6 text-2xl border-4 border-gray-300 rounded-2xl focus:ring-8 focus:ring-emerald-500 outline-none"
            />
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-8 py-6 text-2xl border-4 border-gray-300 rounded-2xl focus:ring-8 focus:ring-emerald-500 outline-none"
          >
            <option value="newest">ใหม่ที่สุด</option>
            <option value="oldest">เก่าที่สุด</option>
            <option value="az">A-Z</option>
          </select>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-12 py-6 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-3xl font-bold flex items-center gap-4 shadow-xl"
          >
            <Plus className="w-12 h-12" />
            เพิ่มสถานที่ใหม่
          </button>
        </div>

        {loading ? (
          <div className="text-center py-20">
            <Loader2 className="w-20 h-20 animate-spin mx-auto text-emerald-600" />
            <p className="text-4xl text-gray-600 mt-6">กำลังโหลดสถานที่...</p>
          </div>
        ) : filteredLocations.length === 0 ? (
          <div className="text-center py-20 bg-gray-50 rounded-3xl border-4 border-gray-200">
            <Building2 className="w-32 h-32 mx-auto text-gray-300 mb-8" />
            <p className="text-5xl text-gray-600 font-medium">ยังไม่มีสถานที่</p>
            <p className="text-3xl text-gray-500 mt-4">กด "เพิ่มสถานที่ใหม่" เพื่อเริ่มต้น</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredLocations.map((loc) => (
              <div key={loc.id} className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-3xl p-8 shadow-xl hover:shadow-2xl transition">
                <div className="flex items-start justify-between mb-6">
                  <div className="flex items-center gap-6">
                    <Building2 className="w-16 h-16 text-emerald-700" />
                    <h3 className="text-3xl font-bold text-gray-800">{loc.name}</h3>
                  </div>
                  <button
                    onClick={() => setShowConfirmDelete(loc)}
                    className="text-red-500 hover:text-red-700 p-3 rounded-xl hover:bg-red-50 transition"
                  >
                    <Trash2 className="w-10 h-10" />
                  </button>
                </div>

                <div className="flex gap-4">
                  <button
                    onClick={() => setShowDetails(loc)}
                    className="flex-1 py-5 bg-gray-700 hover:bg-gray-800 text-white rounded-2xl text-2xl font-medium flex items-center justify-center gap-4 transition"
                  >
                    <Eye className="w-10 h-10" />
                    ดูรายละเอียด
                  </button>
                  <button
                    onClick={() => handleSelectLocation(loc)}  // <-- เรียกฟังก์ชันนี้เพื่อส่งกลับ
                    className="flex-1 py-5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-2xl font-bold flex items-center justify-center gap-4 transition shadow-lg"
                  >
                    <CheckCircle2 className="w-10 h-10" />
                    เลือกสถานที่นี้
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Modal เพิ่มสถานที่ใหม่ */}
        {showAddModal && (
          <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto p-10">
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-5xl font-bold text-gray-800 flex items-center gap-6">
                  <Plus className="w-16 h-16 text-emerald-600" />
                  เพิ่มสถานที่ใหม่
                </h2>
                <button onClick={() => setShowAddModal(false)} className="text-gray-500 hover:text-gray-700">
                  <X className="w-12 h-12" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="md:col-span-2">
                  <label className="block text-3xl font-medium text-gray-700 mb-4">ชื่อโรงพยาบาล *</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="เช่น โรงพยาบาลกรุงเทพ"
                    className="w-full px-8 py-6 text-3xl border-4 border-gray-300 rounded-2xl focus:ring-8 focus:ring-emerald-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-3xl font-medium text-gray-700 mb-4">เลขที่</label>
                  <input type="text" value={form.houseNo} onChange={(e) => setForm({ ...form, houseNo: e.target.value })} className="w-full px-8 py-6 text-3xl border-4 border-gray-300 rounded-2xl focus:ring-8 focus:ring-emerald-500 outline-none" />
                </div>
                <div>
                  <label className="block text-3xl font-medium text-gray-700 mb-4">หมู่</label>
                  <input type="text" value={form.moo} onChange={(e) => setForm({ ...form, moo: e.target.value })} className="w-full px-8 py-6 text-3xl border-4 border-gray-300 rounded-2xl focus:ring-8 focus:ring-emerald-500 outline-none" />
                </div>
                <div>
                  <label className="block text-3xl font-medium text-gray-700 mb-4">ซอย</label>
                  <input type="text" value={form.soi} onChange={(e) => setForm({ ...form, soi: e.target.value })} className="w-full px-8 py-6 text-3xl border-4 border-gray-300 rounded-2xl focus:ring-8 focus:ring-emerald-500 outline-none" />
                </div>
                <div>
                  <label className="block text-3xl font-medium text-gray-700 mb-4">ถนน</label>
                  <input type="text" value={form.road} onChange={(e) => setForm({ ...form, road: e.target.value })} className="w-full px-8 py-6 text-3xl border-4 border-gray-300 rounded-2xl focus:ring-8 focus:ring-emerald-500 outline-none" />
                </div>
                <div>
                  <label className="block text-3xl font-medium text-gray-700 mb-4">แขวง/ตำบล</label>
                  <input type="text" value={form.subDistrict} onChange={(e) => setForm({ ...form, subDistrict: e.target.value })} className="w-full px-8 py-6 text-3xl border-4 border-gray-300 rounded-2xl focus:ring-8 focus:ring-emerald-500 outline-none" />
                </div>
                <div>
                  <label className="block text-3xl font-medium text-gray-700 mb-4">เขต/อำเภอ</label>
                  <input type="text" value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value })} className="w-full px-8 py-6 text-3xl border-4 border-gray-300 rounded-2xl focus:ring-8 focus:ring-emerald-500 outline-none" />
                </div>
                <div>
                  <label className="block text-3xl font-medium text-gray-700 mb-4">จังหวัด</label>
                  <input type="text" value={form.province} onChange={(e) => setForm({ ...form, province: e.target.value })} className="w-full px-8 py-6 text-3xl border-4 border-gray-300 rounded-2xl focus:ring-8 focus:ring-emerald-500 outline-none" />
                </div>
                <div>
                  <label className="block text-3xl font-medium text-gray-700 mb-4">รหัสไปรษณีย์</label>
                  <input type="text" value={form.postcode} onChange={(e) => setForm({ ...form, postcode: e.target.value })} className="w-full px-8 py-6 text-3xl border-4 border-gray-300 rounded-2xl focus:ring-8 focus:ring-emerald-500 outline-none" />
                </div>
              </div>

              {error && (
                <div className="mt-8 text-red-600 text-3xl text-center font-medium flex items-center justify-center gap-4">
                  <AlertCircle className="w-12 h-12" />
                  {error}
                </div>
              )}

              <div className="mt-12 flex justify-end gap-8">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="px-12 py-6 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-2xl text-3xl font-medium transition"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={addLocation}
                  disabled={adding || !form.name.trim()}
                  className="px-16 py-6 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-400 text-white rounded-2xl text-3xl font-bold flex items-center gap-4 transition shadow-xl"
                >
                  {adding && <Loader2 className="w-12 h-12 animate-spin" />}
                  {adding ? 'กำลังบันทึก...' : 'บันทึกสถานที่'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal ดูรายละเอียด */}
        {showDetails && (
          <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl shadow-2xl p-10 max-w-3xl w-full">
              <div className="flex justify-between items-center mb-8">
                <h3 className="text-5xl font-bold text-gray-800 flex items-center gap-6">
                  <Building2 className="w-16 h-16 text-emerald-600" />
                  {showDetails.name}
                </h3>
                <button onClick={() => setShowDetails(null)} className="text-gray-500 hover:text-gray-700">
                  <X className="w-12 h-12" />
                </button>
              </div>
              <div className="text-3xl text-gray-700 leading-relaxed">
                <div className="flex items-start gap-6">
                  <MapPin className="w-12 h-12 text-emerald-600 mt-2" />
                  <div>
                    <p className="font-medium mb-2">ที่อยู่เต็ม</p>
                    <p>
                      {[
                        showDetails.address?.houseNo,
                        showDetails.address?.moo && `หมู่ ${showDetails.address.moo}`,
                        showDetails.address?.soi && `ซอย ${showDetails.address.soi}`,
                        showDetails.address?.road && `ถนน ${showDetails.address.road}`
                      ].filter(Boolean).join(' ')}
                      <br />
                      {showDetails.address?.subDistrict && `แขวง/ตำบล ${showDetails.address.subDistrict}`}
                      {showDetails.address?.district && ` เขต/อำเภอ ${showDetails.address.district}`}
                      <br />
                      {showDetails.address?.province && `จังหวัด${showDetails.address.province}`}
                      {showDetails.address?.postcode && ` ${showDetails.address.postcode}`}
                    </p>
                  </div>
                </div>
              </div>
              <div className="mt-12 flex justify-end">
                <button onClick={() => setShowDetails(null)} className="px-16 py-6 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-3xl font-bold">
                  ปิด
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Confirm Delete */}
        {showConfirmDelete && (
          <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl shadow-2xl p-10 max-w-2xl w-full">
              <h3 className="text-5xl font-bold text-gray-800 mb-8">ยืนยันการลบ</h3>
              <p className="text-3xl text-gray-700 mb-12">
                ลบสถานที่ <span className="text-red-600 font-bold">"{showConfirmDelete.name}"</span> อย่างถาวรหรือไม่?
              </p>
              <div className="flex gap-8 justify-end">
                <button onClick={() => setShowConfirmDelete(null)} className="px-12 py-6 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-2xl text-3xl font-medium">
                  ยกเลิก
                </button>
                <button onClick={() => deleteLocation(showConfirmDelete.id)} className="px-12 py-6 bg-red-600 hover:bg-red-700 text-white rounded-2xl text-3xl font-bold">
                  ลบสถานที่
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Settings;