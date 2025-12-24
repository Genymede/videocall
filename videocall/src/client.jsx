// src/client.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Video, VideoOff, Mic, MicOff, PhoneOff, Users, LogOut, User, Building2 } from 'lucide-react';

import { database } from './firebase';
import { ref, get, onValue } from 'firebase/database';

const ClientApp = () => {
  const [userName, setUserName] = useState('');
  const [isInRoom, setIsInRoom] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [error, setError] = useState('');
  const [myPeerId, setMyPeerId] = useState('');
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [availableRooms, setAvailableRooms] = useState([]);
  const [loadingRooms, setLoadingRooms] = useState(false);

  const localVideoRef = useRef(null);
  const peerRef = useRef(null);
  const localStreamRef = useRef(null);
  const callsRef = useRef({});
  const dataConnectionsRef = useRef({});
  const roomStateRef = useRef({ hostPeerId: null, participants: [] });
  const roomHostListenerRef = useRef(null);

  useEffect(() => {
    const savedLocation = localStorage.getItem('selectedLocation');
    if (savedLocation) {
      try {
        setSelectedLocation(JSON.parse(savedLocation));
      } catch (e) {}
    }

    const savedName = localStorage.getItem('full_name_th') || localStorage.getItem('username');
    if (savedName) setUserName(savedName);
  }, []);

  useEffect(() => {
    if (selectedLocation) {
      setLoadingRooms(true);
      const roomsRef = ref(database, `${selectedLocation.id}/rooms`);
      const unsubscribe = onValue(roomsRef, (snapshot) => {
        const data = snapshot.val() || {};
        const list = Object.keys(data).map(key => ({
          roomId: key,
          ...data[key]
        })).filter(r => r.hostPeerId);
        setAvailableRooms(list);
        setLoadingRooms(false);
      });
      return () => unsubscribe();
    }
  }, [selectedLocation]);

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.2/dist/peerjs.min.js';
    script.async = true;
    script.onload = initializePeer;
    document.body.appendChild(script);

    return () => {
      cleanup();
    };
  }, []);

  const initializePeer = () => {
    const peer = new window.Peer({
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:global.stun.twilio.com:3478' },
          { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
          { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
          { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
        ]
      },
      debug: 2
    });

    peer.on('open', (id) => {
      setMyPeerId(id);
      setConnectionStatus('ready');
    });

    peer.on('call', async (call) => {
      if (!localStreamRef.current) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
          localStreamRef.current = stream;
          if (localVideoRef.current) localVideoRef.current.srcObject = stream;
        } catch (err) {
          return;
        }
      }

      call.answer(localStreamRef.current);
      callsRef.current[call.peer] = call;

      call.on('stream', (remoteStream) => addRemoteStream(call.peer, remoteStream, call.metadata));
      call.on('close', () => removeParticipant(call.peer));
    });

    peer.on('connection', (conn) => setupDataConnection(conn));

    peer.on('error', (err) => {
      if (err.type === 'peer-unavailable') setError('ไม่พบผู้ใช้ที่ต้องการเชื่อมต่อ');
      else setError('เกิดข้อผิดพลาด: ' + err.message);
    });

    peerRef.current = peer;
  };

  const setupDataConnection = (conn) => {
    dataConnectionsRef.current[conn.peer] = conn;
    conn.on('open', () => console.log('Data connection opened with:', conn.peer));
    conn.on('data', (data) => handleSignaling(data, conn.peer));
  };

  const handleSignaling = (data, fromPeer) => {
    const { type, payload } = data;
    switch (type) {
      case 'room-state':
        roomStateRef.current = payload;
        setParticipants(payload.participants);
        payload.participants.forEach(p => {
          if (p.peerId !== myPeerId && !callsRef.current[p.peerId]) {
            setTimeout(() => callPeer(p.peerId, p.name), 500);
          }
        });
        break;
      case 'participant-joined':
        if (!roomStateRef.current.participants.find(p => p.peerId === payload.peerId)) {
          roomStateRef.current.participants.push(payload);
          setParticipants([...roomStateRef.current.participants]);
          if (payload.peerId !== myPeerId) setTimeout(() => callPeer(payload.peerId, payload.name), 500);
        }
        break;
      case 'participant-left':
        roomStateRef.current.participants = roomStateRef.current.participants.filter(p => p.peerId !== payload.peerId);
        setParticipants([...roomStateRef.current.participants]);
        removeParticipant(payload.peerId);
        break;
      case 'host-leaving':
        setError('Host ปิดห้องแล้ว');
        setTimeout(() => leaveRoom(false), 2000);
        break;
    }
  };

  const sendToHost = (message) => {
    const hostPeerId = roomStateRef.current.hostPeerId;
    if (hostPeerId && dataConnectionsRef.current[hostPeerId]) {
      dataConnectionsRef.current[hostPeerId].send(message);
    }
  };

  const joinOrCreateRoom = async (targetRoomId) => {
    if (!userName.trim()) {
      setError('กรุณากรอกชื่อของคุณ');
      return;
    }

    try {
      setConnectionStatus('connecting');
      setError('');

      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      const roomPath = `${selectedLocation.id}/rooms/${targetRoomId}`;
      const roomRef = ref(database, roomPath);

      const snapshot = await get(roomRef);
      const hostPeerId = snapshot.val()?.hostPeerId;

      if (hostPeerId) {
        const dataConn = peerRef.current.connect(hostPeerId, { reliable: true, metadata: { name: userName, roomId: targetRoomId } });
        setupDataConnection(dataConn);

        dataConn.on('open', () => {
          dataConn.send({
            type: 'join-request',
            payload: { peerId: myPeerId, name: userName, isHost: false }
          });
          callPeer(hostPeerId, 'Host');
        });
      }

      setIsInRoom(true);
      setConnectionStatus('connected');

      roomHostListenerRef.current = roomRef;
      onValue(roomRef, (snap) => {
        if (!snap.exists() && isInRoom) {
          setError('Host ปิดห้องแล้ว');
          setTimeout(() => leaveRoom(false), 2000);
        }
      });

    } catch (err) {
      setError('ไม่สามารถเข้าถึงกล้อง/ไมค์: ' + err.message);
      setConnectionStatus('ready');
    }
  };

  const callPeer = async (peerId, peerName) => {
    if (callsRef.current[peerId]) return;

    const call = peerRef.current.call(peerId, localStreamRef.current, { metadata: { name: userName } });
    callsRef.current[peerId] = call;

    call.on('stream', (remoteStream) => addRemoteStream(peerId, remoteStream, { name: peerName }));
    call.on('close', () => delete callsRef.current[peerId]);
  };

  const addRemoteStream = (peerId, stream, metadata) => {
    const container = document.getElementById('remote-videos');
    if (!container) return;

    let wrapper = document.getElementById(`wrapper-${peerId}`);
    if (!wrapper) {
      wrapper = document.createElement('div');
      wrapper.id = `wrapper-${peerId}`;
      wrapper.className = 'relative bg-gray-800 rounded-2xl overflow-hidden shadow-2xl min-h-[300px] flex items-center justify-center';

      const videoElement = document.createElement('video');
      videoElement.id = `video-${peerId}`;
      videoElement.autoplay = true;
      videoElement.playsInline = true;
      videoElement.muted = false;
      videoElement.className = 'w-full h-full object-contain bg-black';

      const label = document.createElement('div');
      label.className = 'absolute bottom-4 left-4 bg-black bg-opacity-60 px-3 py-2 rounded-lg';
      label.innerHTML = `<span class="text-white text-sm font-medium">${metadata.name || 'User'}</span>`;

      wrapper.appendChild(videoElement);
      wrapper.appendChild(label);
      container.appendChild(wrapper);

      videoElement.srcObject = stream;
      videoElement.play().catch(e => console.warn("Play error:", e));
    }
  };

  const removeParticipant = (peerId) => {
    const wrapper = document.getElementById(`wrapper-${peerId}`);
    if (wrapper) wrapper.remove();
    if (callsRef.current[peerId]) callsRef.current[peerId].close();
    delete callsRef.current[peerId];
    if (dataConnectionsRef.current[peerId]) dataConnectionsRef.current[peerId].close();
    delete dataConnectionsRef.current[peerId];
  };

  const cleanup = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
    }
    Object.values(callsRef.current).forEach(call => {
      if (call.close) call.close();
    });
    Object.values(dataConnectionsRef.current).forEach(conn => {
      if (conn.close) conn.close();
    });
    if (peerRef.current && !peerRef.current.destroyed) {
      peerRef.current.destroy();
    }
    if (roomHostListenerRef.current) {
      off(roomHostListenerRef.current);
      roomHostListenerRef.current = null;
    }
  };

  const leaveRoom = async (notifyOthers = true) => {
    if (notifyOthers) {
      sendToHost({
        type: 'participant-left',
        payload: { peerId: myPeerId, name: userName }
      });
    }

    cleanup();

    setIsInRoom(false);
    setParticipants([]);
    setConnectionStatus('ready');
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const track = localStreamRef.current.getVideoTracks()[0];
      if (track) track.enabled = !isVideoEnabled;
      setIsVideoEnabled(!isVideoEnabled);
    }
  };

  const toggleAudio = () => {
    if (localStreamRef.current) {
      const track = localStreamRef.current.getAudioTracks()[0];
      if (track) track.enabled = !isAudioEnabled;
      setIsAudioEnabled(!isAudioEnabled);
    }
  };

  if (!isInRoom) {
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center overflow-hidden">
        <div className="bg-white rounded-3xl shadow-2xl p-12 w-full max-w-5xl mx-8">
          <div className="text-center mb-12">
            <User className="w-32 h-32 text-blue-600 mx-auto mb-8" />
            <h1 className="text-7xl font-bold text-gray-800 mb-6">KIOSK Telemed</h1>
            <p className="text-4xl text-gray-700">ระบบสนทนาทางไกลสำหรับผู้รับบริการ</p>
          </div>

          <div className="mb-12 bg-blue-50 p-10 rounded-3xl border-4 border-blue-300 text-center">
            <Building2 className="w-32 h-32 text-blue-700 mx-auto mb-6" />
            <p className="text-4xl text-blue-800 font-medium mb-4">สถานที่ใช้งาน</p>
            <p className="text-6xl font-bold text-blue-900">
              {selectedLocation ? selectedLocation.name : 'กำลังโหลด...'}
            </p>
          </div>

          <div className="mb-12">
            <label className="block text-4xl font-medium text-gray-700 mb-6 text-center">ชื่อของคุณ</label>
            <input
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="กรอกชื่อผู้รับบริการ"
              className="w-full px-10 py-8 text-5xl text-center border-4 border-blue-300 rounded-3xl focus:ring-8 focus:ring-blue-500 outline-none"
            />
          </div>

          <div>
            <h2 className="text-5xl font-bold text-gray-800 mb-8 text-center">ห้องที่เปิดอยู่</h2>
            {loadingRooms ? (
              <p className="text-center text-4xl text-gray-500 py-12">กำลังโหลดห้อง...</p>
            ) : availableRooms.length === 0 ? (
              <div className="text-center py-16 bg-gray-50 rounded-3xl border-4 border-gray-200">
                <Users className="w-32 h-32 mx-auto text-gray-400 mb-8" />
                <p className="text-5xl text-gray-600 font-medium">ยังไม่มีห้องที่เปิดอยู่</p>
                <p className="text-3xl text-gray-500 mt-4">กรุณารอเจ้าหน้าที่สร้างห้อง</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {availableRooms.map((room) => (
                  <button
                    key={room.roomId}
                    onClick={() => joinOrCreateRoom(room.roomId)}
                    className="p-12 bg-blue-50 hover:bg-blue-100 border-4 border-blue-300 rounded-3xl transition-all hover:scale-105 shadow-2xl flex flex-col items-center justify-center gap-6"
                  >
                    <p className="text-7xl font-bold text-blue-900">{room.roomId}</p>
                    <p className="text-3xl text-blue-700">กดเพื่อเข้าร่วม</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-gray-900 flex flex-col">
      <div className="absolute top-6 right-6 z-50">
        <button
          onClick={() => {
            leaveRoom(true);
            window.location.href = 'about:blank';
          }}
          className="w-20 h-20 bg-red-600 hover:bg-red-700 rounded-full shadow-2xl flex items-center justify-center transition-all"
        >
          <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <User className="w-10 h-10 text-blue-400" />
            <span className="text-white text-4xl font-mono font-bold">{roomId}</span>
          </div>
          <div className="flex items-center gap-6">
            <Users className="w-10 h-10 text-gray-400" />
            <span className="text-white text-3xl">{participants.length} คน</span>
          </div>
        </div>
      </div>

      {selectedLocation && (
        <div className="bg-blue-900 text-white px-6 py-3 text-center">
          <div className="flex items-center justify-center gap-4">
            <Building2 className="w-8 h-8" />
            <span className="text-2xl font-medium">{selectedLocation.name}</span>
          </div>
        </div>
      )}

      <div className="flex-1 p-8 overflow-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
          <div className="relative bg-gray-800 rounded-3xl overflow-hidden shadow-2xl min-h-[400px]">
            <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover mirror" />
            <div className="absolute bottom-6 left-6 bg-black bg-opacity-70 px-6 py-3 rounded-2xl">
              <span className="text-white text-2xl font-medium">{userName} (คุณ)</span>
            </div>
          </div>
          <div id="remote-videos" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8 contents"></div>
        </div>
      </div>

      <div className="bg-gray-800 border-t border-gray-700 px-6 py-8">
        <div className="flex items-center justify-center gap-8">
          <button onClick={toggleVideo} className={`p-8 rounded-full ${isVideoEnabled ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-600 hover:bg-red-700'}`}>
            {isVideoEnabled ? <Video className="w-16 h-16 text-white" /> : <VideoOff className="w-16 h-16 text-white" />}
          </button>
          <button onClick={toggleAudio} className={`p-8 rounded-full ${isAudioEnabled ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-600 hover:bg-red-700'}`}>
            {isAudioEnabled ? <Mic className="w-16 h-16 text-white" /> : <MicOff className="w-16 h-16 text-white" />}
          </button>
          <button onClick={() => leaveRoom(true)} className="px-12 py-8 bg-red-600 hover:bg-red-700 rounded-3xl flex items-center gap-6">
            <LogOut className="w-16 h-16 text-white" />
            <span className="text-white text-4xl font-bold">ออกจากห้อง</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ClientApp;