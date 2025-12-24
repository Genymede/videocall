// src/host.jsx
import React, { useState, useEffect, useRef } from 'react';
import { 
  Video, VideoOff, Mic, MicOff, Phone, PhoneOff, Copy, Users, LogOut, 
  Crown, Building2, Settings as SettingsIcon 
} from 'lucide-react';

import { database } from './firebase';
import { ref, set, get, remove, onValue, off } from 'firebase/database';

import Settings from './settings';

const HostApp = () => {
  const [roomId, setRoomId] = useState('');
  const [userName, setUserName] = useState('');
  const [isInRoom, setIsInRoom] = useState(false);
  const [isHost] = useState(true);
  const [participants, setParticipants] = useState([]);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [error, setError] = useState('');
  const [myPeerId, setMyPeerId] = useState('');
  const [copied, setCopied] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  const localVideoRef = useRef(null);
  const peerRef = useRef(null);
  const localStreamRef = useRef(null);
  const callsRef = useRef({});
  const dataConnectionsRef = useRef({});
  const roomStateRef = useRef({ hostPeerId: null, participants: [] });
  const roomHostListenerRef = useRef(null);

  // โหลดสถานที่
  useEffect(() => {
    const saved = localStorage.getItem('selectedLocation');
    if (saved) {
      try {
        const loc = JSON.parse(saved);
        setSelectedLocation(loc);
      } catch (e) {
        console.error('Error parsing selectedLocation', e);
      }
    }
  }, []);

  // PeerJS initialization
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

  useEffect(() => {
    if (isInRoom && localStreamRef.current && localVideoRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
  }, [isInRoom]);

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
      case 'ping':
        if (dataConnectionsRef.current[fromPeer]) {
          dataConnectionsRef.current[fromPeer].send({ type: 'pong', payload: { peerId: myPeerId } });
        }
        break;
    }
  };

  const broadcastToAll = (message) => {
    Object.values(dataConnectionsRef.current).forEach(conn => {
      if (conn.open) conn.send(message);
    });
  };

  const generateRoomId = () => {
    const id = Math.random().toString(36).substring(2, 8).toUpperCase();
    setRoomId(id);
  };

  const joinOrCreateRoom = async () => {
  if (!userName.trim()) {
    setError('กรุณากรอกชื่อของคุณ');
    return;
  }
  if (!selectedLocation) {
    setError('กรุณาเลือกสถานที่');
    return;
  }
  if (!roomId) {
    setError('กรุณากรอกรหัสห้องหรือกดสร้าง');
    return;
  }

  try {
    setConnectionStatus('connecting');
    setError('');

    // เปิดกล้องทันที (สำหรับ Host)
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localStreamRef.current = stream;
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
      localVideoRef.current.play().catch(e => console.warn('Local video play error:', e));
    }

    const roomPath = `${selectedLocation.id}/rooms/${roomId}`;
    const roomRef = ref(database, roomPath);

    const snapshot = await get(roomRef);
    const hostPeerId = snapshot.val()?.hostPeerId;

    await set(roomRef, {
      hostPeerId: myPeerId,
      createdAt: Date.now(),
      locationName: selectedLocation.name
    });

    roomStateRef.current = {
      roomId,
      hostPeerId: myPeerId,
      participants: [{ peerId: myPeerId, name: userName, isHost: true }]
    };

    setIsInRoom(true);
    setConnectionStatus('waiting');

    roomHostListenerRef.current = roomRef;
    onValue(roomRef, (snap) => {
      if (!snap.exists() && isInRoom) {
        setError('Host ปิดห้องแล้ว');
        setTimeout(() => leaveRoom(false), 2000);
      }
    });

  } catch (err) {
    console.error('Media error:', err);
    setError('ไม่สามารถเปิดกล้องหรือไมโครโฟนได้: ' + err.message);
    setConnectionStatus('ready');
  }
};

  const callPeer = async (peerId, peerName) => {
    if (callsRef.current[peerId]) return;

    const dataConn = peerRef.current.connect(peerId, { reliable: true, metadata: { name: userName, roomId } });
    setupDataConnection(dataConn);

    const call = peerRef.current.call(peerId, localStreamRef.current, { metadata: { name: userName, roomId } });
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
    if (notifyOthers && isHost) {
      const savedLocation = localStorage.getItem('selectedLocation');
      let roomPath = `rooms/${roomId}`;
      if (savedLocation) {
        try {
          const loc = JSON.parse(savedLocation);
          roomPath = `${loc.id}/rooms/${roomId}`;
        } catch (e) {}
      }
      await remove(ref(database, roomPath));
      broadcastToAll({ type: 'host-leaving', payload: { roomId } });
    }

    cleanup();

    setIsInRoom(false);
    setParticipants([]);
    setConnectionStatus('ready');
    setRoomId('');
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

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isInRoom) {
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center overflow-hidden">
        <div className="bg-white rounded-3xl shadow-2xl p-12 w-full max-w-4xl mx-8">
          <div className="text-center mb-10">
            <Crown className="w-32 h-32 text-yellow-600 mx-auto mb-6" />
            <h1 className="text-6xl font-bold text-gray-800 mb-4">Host Control Panel</h1>
            <p className="text-3xl text-gray-600">ระบบจัดการห้องสนทนาทางไกล</p>
          </div>

          <div className="mb-10 bg-emerald-50 p-8 rounded-2xl border-4 border-emerald-300 flex items-center justify-between">
            <div className="flex items-center gap-6">
              <Building2 className="w-20 h-20 text-emerald-700" />
              <div>
                <p className="text-2xl text-emerald-800 font-medium">สถานที่ปัจจุบัน</p>
                <p className="text-5xl font-bold text-emerald-900">
                  {selectedLocation ? selectedLocation.name : 'ยังไม่ได้เลือก'}
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowSettings(true)}
              className="px-10 py-6 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-3xl font-bold flex items-center gap-4 shadow-xl"
            >
              <SettingsIcon className="w-12 h-12" />
              ตั้งค่าสถานที่
            </button>
          </div>

          <div className="space-y-8">
            <div>
              <label className="block text-3xl font-medium text-gray-700 mb-4">ชื่อของคุณ (Host)</label>
              <input
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="กรอกชื่อเจ้าหน้าที่"
                className="w-full px-8 py-6 text-4xl border-4 border-gray-300 rounded-2xl focus:ring-8 focus:ring-emerald-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-3xl font-medium text-gray-700 mb-4">รหัสห้อง</label>
              <div className="flex gap-6">
                <input
                  type="text"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                  placeholder="กรอกหรือสร้างรหัส"
                  className="flex-1 px-8 py-6 text-4xl border-4 border-gray-300 rounded-2xl focus:ring-8 focus:ring-emerald-500 outline-none uppercase font-mono"
                />
                <button
                  onClick={generateRoomId}
                  className="px-12 py-6 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-4xl font-bold shadow-xl"
                >
                  สร้าง
                </button>
              </div>
            </div>

            <button
              onClick={joinOrCreateRoom}
              disabled={!roomId || !userName || connectionStatus === 'connecting'}
              className="w-full py-8 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-400 text-white font-bold text-5xl rounded-3xl shadow-2xl flex items-center justify-center gap-6"
            >
              <Crown className="w-16 h-16" />
              สร้างและเปิดห้อง
            </button>
          </div>

          {error && (
            <div className="mt-8 text-red-600 text-3xl text-center font-medium">
              {error}
            </div>
          )}
        </div>

        {showSettings && (
          <Settings
            onClose={() => setShowSettings(false)}
            onSelectLocation={(loc) => {
              setSelectedLocation(loc);
              localStorage.setItem('selectedLocation', JSON.stringify(loc));
            }}
          />
        )}
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
            <Crown className="w-10 h-10 text-yellow-400" />
            <span className="text-white text-4xl font-mono font-bold">{roomId}</span>
            <span className="bg-yellow-500 text-gray-900 px-4 py-2 rounded text-2xl font-bold">HOST</span>
          </div>
          <button onClick={copyRoomId} className="flex items-center gap-3 px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-xl text-white text-2xl">
            {copied ? 'คัดลอกแล้ว!' : 'คัดลอกรหัสห้อง'}
          </button>
        </div>
      </div>

      {selectedLocation && (
        <div className="bg-emerald-900 text-white px-6 py-3 text-center">
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
            <div className="absolute bottom-6 left-6 bg-black bg-opacity-70 px-6 py-3 rounded-2xl flex items-center gap-4">
              <Crown className="w-8 h-8 text-yellow-400" />
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
            <PhoneOff className="w-16 h-16 text-white" />
            <span className="text-white text-4xl font-bold">ปิดห้อง</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default HostApp;