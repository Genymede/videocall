import React, { useState, useEffect, useRef } from 'react';
import { Video, VideoOff, Mic, MicOff, Phone, PhoneOff, Copy, Users, UserPlus, LogOut, Crown, User, Check, Building2, Settings, Radio } from 'lucide-react';

import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, get, remove, onValue, off } from 'firebase/database';

import LocationSettings from './LocationSettings'; // ปรับ path ให้ถูกต้อง

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

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

const PeerJSRoomVideoCall = () => {
	const [roomId, setRoomId] = useState('');
	const [userName, setUserName] = useState('');
	const [isInRoom, setIsInRoom] = useState(false);
	const [isHost, setIsHost] = useState(false);
	const [participants, setParticipants] = useState([]);
	const [isVideoEnabled, setIsVideoEnabled] = useState(true);
	const [isAudioEnabled, setIsAudioEnabled] = useState(true);
	const [connectionStatus, setConnectionStatus] = useState('disconnected');
	const [error, setError] = useState('');
	const [myPeerId, setMyPeerId] = useState('');
	const [copied, setCopied] = useState(false);
	const [isRoleDropdownOpen, setIsRoleDropdownOpen] = useState(false);

	// --- Role และ Location ---
	const [userRole, setUserRole] = useState('client'); // 'host' หรือ 'client' (default: client)
	const [selectedLocation, setSelectedLocation] = useState(null);
	const [showLocationSettings, setShowLocationSettings] = useState(false);

	// --- สำหรับ Client: รายการห้องที่เปิดอยู่ ---
	const [availableRooms, setAvailableRooms] = useState([]);
	const [loadingRooms, setLoadingRooms] = useState(false);

	const localVideoRef = useRef(null);
	const peerRef = useRef(null);
	const localStreamRef = useRef(null);
	const callsRef = useRef({});
	const dataConnectionsRef = useRef({});
	const roomStateRef = useRef({ hostPeerId: null, participants: [] });
	const roomHostListenerRef = useRef(null);

	const [fullName, setFullName] = useState("");

	useEffect(() => {
    function onMessage(event) {
      const allowedOrigins = [
        "http://localhost",
        "http://127.0.0.1",
      ];

      if (!allowedOrigins.includes(event.origin)) return;

      if (event.data?.type === "FULL_NAME_TH") {
        const name = event.data.value || "";
        setFullName(name);
        localStorage.setItem("full_name_th", name); // เก็บฝั่ง ngrok เอง

				if (userRole === 'client') {
					setUserName(prev => prev || name);
				}
      }
    }
		window.addEventListener('message', (event) => {
			console.log('EVENT.ORIGIN =', event.origin);
			console.log('PAYLOAD.FROM =', event.data?.from);
			console.log('DATA =', event.data);
		});

    window.addEventListener("message", onMessage);
		console.log("Full Name from parent:", fullName);
    return () => window.removeEventListener("message", onMessage);
		
  }, []);

	// โหลด Role, Location และ Username (เฉพาะ Client)
	useEffect(() => {
		// โหลด Role
		const savedRole = localStorage.getItem('userRole');
		if (savedRole && ['host', 'client'].includes(savedRole)) {
			setUserRole(savedRole);
		} else {
			localStorage.setItem('userRole', 'client'); // default เป็น client
		}

		// โหลด Location
		const savedLocation = localStorage.getItem('selectedLocation');
		if (savedLocation) {
			try {
				const loc = JSON.parse(savedLocation);
				setSelectedLocation(loc);
			} catch (e) {
				console.error('Error parsing selectedLocation', e);
			}
		}

		// โหลด Username เฉพาะเมื่อเป็น Client
		if (savedRole === 'client') {
			const savedName = localStorage.getItem('full_name_th');
			if (savedName) {
				setUserName(savedName);
				console.log('Loaded saved username for Client:', savedName);
			}
		} else {
			// ถ้าเป็น Host ให้เริ่มต้นชื่อว่าง
			setUserName(''); 
		}
	}, []);

	// เมื่อเปลี่ยนบทบาท ถ้าเป็น Host ให้ล้างชื่อ
	useEffect(() => {
		if (userRole === 'host') {
			setUserName(''); // ชื่อว่างสำหรับ Host
			localStorage.removeItem('full_name_th'); // ลบชื่อเก่าออก
		}
	}, [userRole]);

	useEffect(() => {
		const handleClickOutside = (event) => {
			if (!event.target.closest('.relative')) {
				setIsRoleDropdownOpen(false);
			}
		};

		document.addEventListener('mousedown', handleClickOutside);
		return () => document.removeEventListener('mousedown', handleClickOutside);
	}, []);

	// โหลดรายการห้องสำหรับ Client
	useEffect(() => {
		if (userRole === 'client' && selectedLocation) {
			setLoadingRooms(true);
			const roomsRef = ref(database, `${selectedLocation.id}/rooms`);

			const unsubscribe = onValue(roomsRef, (snapshot) => {
				const data = snapshot.val() || {};
				const roomsList = Object.keys(data).map(key => ({
					roomId: key,
					...data[key]
				})).filter(room => room.hostPeerId); // มี host อยู่

				setAvailableRooms(roomsList);
				setLoadingRooms(false);
			});

			return () => unsubscribe();
		} else {
			setAvailableRooms([]);
		}
	}, [userRole, selectedLocation]);

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
		if (localStreamRef.current && localVideoRef.current) {
			localVideoRef.current.srcObject = localStreamRef.current;
			console.log('Local video updated');
		}
	}, [localStreamRef.current]);

	useEffect(() => {
		if (localVideoRef.current && localStreamRef.current) {
			localVideoRef.current.srcObject = localStreamRef.current;
		}
	}, [isInRoom]);

	const initializePeer = () => {
		const peer = new window.Peer({
			config: {
				iceServers: [
					// Google STUN (มาตรฐาน)
					{ urls: 'stun:stun.l.google.com:19302' },
					{ urls: 'stun:stun1.l.google.com:19302' },

					// Twilio STUN (เชื่อถือได้)
					{ urls: 'stun:global.stun.twilio.com:3478' },

					// OpenRelay TURN (Creds provided) - ใช้เป็นตัวเลือก Relay หลัก
					{ urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
					{ urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
					{ urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
				]
			},
			debug: 2
		});

		peer.on('open', (id) => {
			console.log('My peer ID:', id);
			setMyPeerId(id);
			setConnectionStatus('ready');
		});

		peer.on('call', async (call) => {
			console.log('Receiving call from:', call.peer, 'metadata:', call.metadata);

			if (!localStreamRef.current) {
				try {
					const stream = await navigator.mediaDevices.getUserMedia({
						video: true,
						audio: true
					});
					localStreamRef.current = stream;
					if (localVideoRef.current) {
						localVideoRef.current.srcObject = stream;

						// ใช้ onloadedmetadata เพื่อให้แน่ใจว่าเล่นเมื่อพร้อม
						localVideoRef.current.onloadedmetadata = () => {
							localVideoRef.current.play().catch(e => console.error("Local Play Error:", e));
						};
					}
				} catch (err) {
					console.error('Error getting media:', err);
					return;
				}
			}

			call.answer(localStreamRef.current);
			callsRef.current[call.peer] = call;

			call.on('stream', (remoteStream) => {
				console.log('Received stream from:', call.peer);
				addRemoteStream(call.peer, remoteStream, call.metadata);
			});

			call.on('close', () => {
				console.log('Call closed:', call.peer);
				removeParticipant(call.peer);
			});

			call.on('error', (err) => {
				console.error('Call error with', call.peer, err);
			});
		});

		peer.on('connection', (conn) => {
			console.log('Data connection from:', conn.peer);
			setupDataConnection(conn);
		});

		peer.on('disconnected', () => {
			console.log('Disconnected from PeerJS server, attempting reconnect...');
			peer.reconnect();
		});

		peer.on('error', (err) => {
			console.error('Peer error:', err);
			if (err.type === 'peer-unavailable') {
				setError('ไม่พบผู้ใช้ที่ต้องการเชื่อมต่อ อาจจะออกจากห้องไปแล้ว');
			} else if (err.type === 'network') {
				setError('เกิดข้อผิดพลาดเครือข่าย กำลังลองเชื่อมต่อใหม่...');
			} else {
				setError('เกิดข้อผิดพลาด: ' + err.message);
			}
		});

		peerRef.current = peer;
	};

	const setupDataConnection = (conn) => {
		dataConnectionsRef.current[conn.peer] = conn;

		conn.on('open', () => {
			console.log('Data connection opened with:', conn.peer);
		});

		conn.on('data', (data) => {
			console.log('Received data from', conn.peer, ':', data);
			handleSignaling(data, conn.peer);
		});

		conn.on('close', () => {
			console.log('Data connection closed:', conn.peer);
			delete dataConnectionsRef.current[conn.peer];
		});

		conn.on('error', (err) => {
			console.error('Data connection error:', err);
		});
	};

	const handleSignaling = (data, fromPeer) => {
		const { type, payload } = data;

		switch (type) {
			case 'room-state':
				console.log('Received room state:', payload);
				roomStateRef.current = payload;
				setParticipants(payload.participants);
				setIsHost(payload.hostPeerId === myPeerId);

				payload.participants.forEach(p => {
					if (p.peerId !== myPeerId && !callsRef.current[p.peerId]) {
						setTimeout(() => {
							callPeer(p.peerId, p.name);
						}, 500);
					}
				});
				break;

			case 'participant-joined':
				console.log('Participant joined:', payload);
				if (!roomStateRef.current.participants.find(p => p.peerId === payload.peerId)) {
					roomStateRef.current.participants.push(payload);
					setParticipants([...roomStateRef.current.participants]);

					if (payload.peerId !== myPeerId) {
						setTimeout(() => {
							callPeer(payload.peerId, payload.name);
						}, 500);
					}
				}
				break;

			case 'participant-left':
				console.log('Participant left:', payload);
				roomStateRef.current.participants = roomStateRef.current.participants.filter(
					p => p.peerId !== payload.peerId
				);
				setParticipants([...roomStateRef.current.participants]);
				removeParticipant(payload.peerId);
				break;

			case 'host-leaving':
				console.log('Host is leaving, room closing');
				setError('Host ปิดห้องแล้ว');
				setTimeout(() => {
					leaveRoom(false);
				}, 2000);
				break;

			case 'ping':
				if (dataConnectionsRef.current[fromPeer]) {
					dataConnectionsRef.current[fromPeer].send({
						type: 'pong',
						payload: { peerId: myPeerId }
					});
				}
				break;

			default:
				console.log('Unknown message type:', type);
		}
	};

	const broadcastToAll = (message) => {
		console.log('Broadcasting:', message.type);
		Object.entries(dataConnectionsRef.current).forEach(([peerId, conn]) => {
			if (conn.open) {
				try {
					conn.send(message);
				} catch (err) {
					console.error('Error sending to', peerId, err);
				}
			}
		});
	};

	const sendToHost = (message) => {
		const hostPeerId = roomStateRef.current.hostPeerId;
		if (hostPeerId && dataConnectionsRef.current[hostPeerId]) {
			dataConnectionsRef.current[hostPeerId].send(message);
		}
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
		// ลบ listener Firebase
		if (roomHostListenerRef.current) {
			off(roomHostListenerRef.current);
			roomHostListenerRef.current = null;
		}
	};



	// const generateRoomId = () => {
	// 	const id = Math.random().toString(36).substring(2, 8).toUpperCase();
	// 	setRoomId(id);
	// };

	// const joinRoom = async () => {
	// 	if (!roomId || !userName) {
	// 		setError('กรุณากรอกรหัสห้องและชื่อของคุณ');
	// 		return;
	// 	}

	// 	try {
	// 		setConnectionStatus('connecting');
	// 		setError('');

	// 		const stream = await navigator.mediaDevices.getUserMedia({
	// 			video: true,
	// 			audio: true
	// 		});

	// 		localStreamRef.current = stream;
	// 		if (localVideoRef.current) {
	// 			localVideoRef.current.srcObject = stream;
	// 		}

	// 		const roomRef = ref(database, `rooms/${roomId}`);

	// 		const snapshot = await get(roomRef);
	// 		const hostPeerId = snapshot.val()?.hostPeerId;

	// 		if (!hostPeerId || hostPeerId === myPeerId) {
	// 			console.log('Creating new room as host');
	// 			await set(roomRef, {
	// 				hostPeerId: myPeerId,
	// 				createdAt: Date.now()
	// 			});

	// 			roomStateRef.current = {
	// 				roomId,
	// 				hostPeerId: myPeerId,
	// 				participants: [{
	// 					peerId: myPeerId,
	// 					name: userName,
	// 					isHost: true
	// 				}]
	// 			};

	// 			setIsHost(true);
	// 			setParticipants(roomStateRef.current.participants);
	// 			setIsInRoom(true);
	// 			setConnectionStatus('waiting');

	// 		} else {
	// 			console.log('Joining existing room, host:', hostPeerId);
	// 			setIsHost(false);

	// 			const dataConn = peerRef.current.connect(hostPeerId, {
	// 				reliable: true,
	// 				metadata: { name: userName, roomId }
	// 			});

	// 			setupDataConnection(dataConn);

	// 			dataConn.on('open', () => {
	// 				console.log('Connected to host, requesting room state');

	// 				dataConn.send({
	// 					type: 'join-request',
	// 					payload: {
	// 						peerId: myPeerId,
	// 						name: userName,
	// 						isHost: false
	// 					}
	// 				});

	// 				callPeer(hostPeerId, 'Host');
	// 			});

	// 			setIsInRoom(true);
	// 			setConnectionStatus('connected');
	// 		}

	// 		// ติดตามสถานะ host (ถ้า host หาย = ปิดห้อง)
	// 		roomHostListenerRef.current = roomRef;
	// 		onValue(roomRef, (snap) => {
	// 			if (!snap.exists() && isInRoom) {
	// 				console.log('Room deleted by host');
	// 				setError('Host ปิดห้องแล้ว');
	// 				setTimeout(() => leaveRoom(false), 2000);
	// 			}
	// 		});

	// 	} catch (err) {
	// 		console.error('Error joining room:', err);
	// 		setError('ไม่สามารถเข้าถึงกล้องหรือไมค์: ' + err.message);
	// 		setConnectionStatus('ready');
	// 	}
	// };
	// ฟังก์ชันสร้างรหัสห้อง (เฉพาะ Host)
	const generateRoomId = () => {
		const id = Math.random().toString(36).substring(2, 8).toUpperCase();
		setRoomId(id);
	};

	// เข้าร่วมหรือสร้างห้อง (ปรับตาม Role)
	const joinOrCreateRoom = async (targetRoomId = roomId) => {
		if (!userName.trim()) {
			setError('กรุณากรอกชื่อของคุณ');
			return;
		}

		if (!selectedLocation) {
			setError('กรุณาเลือกสถานที่ก่อน');
			return;
		}

		if (userRole === 'host' && !targetRoomId) {
			setError('กรุณากรอกรหัสห้องหรือกดสร้างรหัส');
			return;
		}

		try {
			setConnectionStatus('connecting');
			setError('');

			const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
			localStreamRef.current = stream;
			if (localVideoRef.current) localVideoRef.current.srcObject = stream;

			const finalRoomId = targetRoomId;
			const roomPath = `${selectedLocation.id}/rooms/${finalRoomId}`;
			const roomRef = ref(database, roomPath);

			const snapshot = await get(roomRef);
			const hostPeerId = snapshot.val()?.hostPeerId;

			if (userRole === 'host' || (!hostPeerId || hostPeerId === myPeerId)) {
				// เป็น Host หรือสร้างห้องใหม่
				await set(roomRef, {
					hostPeerId: myPeerId,
					createdAt: Date.now(),
					locationName: selectedLocation.name
				});

				roomStateRef.current = {
					roomId: finalRoomId,
					hostPeerId: myPeerId,
					participants: [{ peerId: myPeerId, name: userName, isHost: true }]
				};

				setIsHost(true);
				setRoomId(finalRoomId);
			} else {
				// เป็น Client เข้าร่วมห้องที่มีอยู่
				setIsHost(false);
				setRoomId(finalRoomId);
			}

			setIsInRoom(true);
			setConnectionStatus(hostPeerId ? 'connected' : 'waiting');

			// ตั้ง listener การปิดห้อง
			roomHostListenerRef.current = roomRef;
			onValue(roomRef, (snap) => {
				if (!snap.exists() && isInRoom) {
					setError('Host ปิดห้องแล้ว');
					setTimeout(() => leaveRoom(false), 2000);
				}
			});

			// เชื่อมต่อกับ Host (ถ้ามี)
			if (hostPeerId && hostPeerId !== myPeerId) {
				const dataConn = peerRef.current.connect(hostPeerId, { reliable: true, metadata: { name: userName, roomId: finalRoomId } });
				setupDataConnection(dataConn);

				dataConn.on('open', () => {
					dataConn.send({
						type: 'join-request',
						payload: { peerId: myPeerId, name: userName, isHost: false }
					});
					callPeer(hostPeerId, 'Host');
				});
			}

		} catch (err) {
			console.error('Error:', err);
			setError('ไม่สามารถเข้าถึงกล้อง/ไมค์: ' + err.message);
			setConnectionStatus('ready');
		}
	};

	const callPeer = async (peerId, peerName) => {
		if (callsRef.current[peerId]) {
			console.log('Already calling', peerId);
			return;
		}

		if (!dataConnectionsRef.current[peerId]) {
			console.log('Creating data connection to', peerId);
			const dataConn = peerRef.current.connect(peerId, {
				reliable: true,
				metadata: { name: userName, roomId }
			});
			setupDataConnection(dataConn);
		}

		console.log('Calling peer:', peerId);

		try {
			const call = peerRef.current.call(peerId, localStreamRef.current, {
				metadata: { name: userName, roomId }
			});

			callsRef.current[peerId] = call;

			call.on('stream', (remoteStream) => {
				console.log('Received stream from:', peerId);
				addRemoteStream(peerId, remoteStream, { name: peerName });
			});

			call.on('close', () => {
				console.log('Call closed:', peerId);
				delete callsRef.current[peerId];
			});

			call.on('error', (err) => {
				console.error('Call error with', peerId, err);
				delete callsRef.current[peerId];
			});

			if (isHost) {
				setTimeout(() => {
					if (dataConnectionsRef.current[peerId]?.open) {
						dataConnectionsRef.current[peerId].send({
							type: 'room-state',
							payload: roomStateRef.current
						});
					}
				}, 1000);
			}

		} catch (err) {
			console.error('Error calling peer:', err);
		}
	};

	useEffect(() => {
		if (!isInRoom || !isHost) return;

		const interval = setInterval(() => {
			Object.entries(dataConnectionsRef.current).forEach(([peerId, conn]) => {
				if (conn.open) {
					conn.send({ type: 'ping', payload: { peerId: myPeerId } });
				}
			});
		}, 5000);

		return () => clearInterval(interval);
	}, [isInRoom, isHost, myPeerId]);

	useEffect(() => {
		if (!isInRoom) return;

		const handleMessage = (data, fromPeer) => {
			if (data.type === 'join-request' && isHost) {
				console.log('Join request from:', data.payload);

				const newParticipant = data.payload;
				if (!roomStateRef.current.participants.find(p => p.peerId === newParticipant.peerId)) {
					roomStateRef.current.participants.push(newParticipant);
					setParticipants([...roomStateRef.current.participants]);

					broadcastToAll({
						type: 'participant-joined',
						payload: newParticipant
					});

					setTimeout(() => {
						callPeer(newParticipant.peerId, newParticipant.name);
					}, 500);
				}
			}
		};

		Object.values(dataConnectionsRef.current).forEach(conn => {
			const originalHandler = conn._events?.data?.[0];
			conn.off('data', originalHandler);
			conn.on('data', (data) => {
				handleMessage(data, conn.peer);
				handleSignaling(data, conn.peer);
			});
		});

	}, [isInRoom, isHost]);

	const addRemoteStream = (peerId, stream, metadata) => {
		console.log('Adding remote stream for:', peerId, metadata);
		const container = document.getElementById('remote-videos');
		if (!container) {
			console.error('Remote videos container not found');
			return;
		}

		let wrapper = document.getElementById(`wrapper-${peerId}`);
		if (!wrapper) {
			console.log('Creating new video element for:', peerId);
			wrapper = document.createElement('div');
			wrapper.id = `wrapper-${peerId}`;
			wrapper.className = 'relative bg-gray-800 rounded-2xl overflow-hidden shadow-2xl min-h-[300px]';

			const videoElement = document.createElement('video');
			videoElement.id = `video-${peerId}`;
			videoElement.autoplay = true;
			videoElement.playsInline = true;
			videoElement.muted = false;
			videoElement.className = 'w-full h-full object-cover';

			videoElement.onloadedmetadata = () => {
				console.log('Video metadata loaded for:', peerId);
				videoElement.play().catch(err => console.error('Play error:', err));
			};

			videoElement.onplaying = () => {
				console.log('Video playing for:', peerId);
			};

			videoElement.autoplay = true;
			videoElement.playsInline = true;
			videoElement.muted = false; // Remote stream ไม่ควร muted
			videoElement.className = 'w-full h-full object-cover';

			const label = document.createElement('div');
			label.className = 'absolute bottom-4 left-4 bg-black bg-opacity-60 px-3 py-2 rounded-lg';

			const participant = participants.find(p => p.peerId === peerId) ||
				roomStateRef.current.participants.find(p => p.peerId === peerId);
			const displayName = metadata?.name || participant?.name || 'User';

			label.innerHTML = `<span class="text-white text-sm font-medium">${displayName}</span>`;

			wrapper.appendChild(videoElement);
			wrapper.appendChild(label);
			container.appendChild(wrapper);

			videoElement.srcObject = stream;
			videoElement.onloadedmetadata = () => {
				videoElement.play().catch(e => console.warn("Remote Play Error (Autoplay Blocked):", e));
			};
			console.log('Stream assigned to video element for:', peerId);
		} else {
			console.log('Updating existing video element for:', peerId);
			const videoElement = document.getElementById(`video-${peerId}`);
			if (videoElement) {
				videoElement.srcObject = stream;
				videoElement.play().catch(err => console.error('Play error:', err));
			}
		}
	};

	const removeParticipant = (peerId) => {
		const wrapper = document.getElementById(`wrapper-${peerId}`);
		if (wrapper) {
			wrapper.remove();
		}

		if (callsRef.current[peerId]) {
			callsRef.current[peerId].close();
			delete callsRef.current[peerId];
		}

		if (dataConnectionsRef.current[peerId]) {
			dataConnectionsRef.current[peerId].close();
			delete dataConnectionsRef.current[peerId];
		}
	};

	const leaveRoom = async (notifyOthers = true) => {
		if (notifyOthers) {
			if (isHost) {
				console.log('Host กำลังปิดห้องและลบข้อมูลห้องออกจาก Firebase');

				// ตรวจสอบว่ามี selectedLocation หรือไม่
				const savedLocation = localStorage.getItem('selectedLocation');
				let roomPath = `rooms/${roomId}`; // fallback เก่า

				if (savedLocation) {
					try {
						const loc = JSON.parse(savedLocation);
						roomPath = `${loc.id}/rooms/${roomId}`;
						console.log('ลบห้องภายใต้ location:', loc.name, 'Path:', roomPath);
					} catch (e) {
						console.warn('ไม่สามารถ parse selectedLocation ได้ ใช้ path เก่า');
					}
				} else {
					console.log('ไม่มี location ที่เลือก ใช้ path เก่า:', roomPath);
				}

				try {
					const roomRef = ref(database, roomPath);
					await remove(roomRef);
					console.log('ลบห้องสำเร็จ:', roomPath);
				} catch (err) {
					console.error('เกิดข้อผิดพลาดในการลบห้อง:', err);
				}

				broadcastToAll({
					type: 'host-leaving',
					payload: { roomId }
				});
			} else {
				console.log('Client ออกจากห้อง');

				sendToHost({
					type: 'participant-left',
					payload: { peerId: myPeerId, name: userName }
				});
			}
		}

		// ส่วน cleanup เดิม (หยุด stream, ปิด connection ฯลฯ)
		if (localStreamRef.current) {
			localStreamRef.current.getTracks().forEach(track => track.stop());
		}

		Object.entries(callsRef.current).forEach(([peerId, call]) => {
			call.close();
		});
		callsRef.current = {};

		Object.entries(dataConnectionsRef.current).forEach(([peerId, conn]) => {
			conn.close();
		});
		dataConnectionsRef.current = {};

		setIsInRoom(false);
		setIsHost(false);
		setParticipants([]);
		setConnectionStatus('ready');
		roomStateRef.current = { hostPeerId: null, participants: [] };

		if (localVideoRef.current) {
			localVideoRef.current.srcObject = null;
		}

		const container = document.getElementById('remote-videos');
		if (container) {
			container.innerHTML = '';
		}

		if (!notifyOthers) {
			setError('');
		}
	};

	const toggleVideo = () => {
		if (localStreamRef.current) {
			const videoTrack = localStreamRef.current.getVideoTracks()[0];
			if (videoTrack) {
				videoTrack.enabled = !isVideoEnabled;
				setIsVideoEnabled(!isVideoEnabled);
			}
		}
	};

	const toggleAudio = () => {
		if (localStreamRef.current) {
			const audioTrack = localStreamRef.current.getAudioTracks()[0];
			if (audioTrack) {
				audioTrack.enabled = !isAudioEnabled;
				setIsAudioEnabled(!isAudioEnabled);
			}
		}
	};

	const copyRoomId = () => {
		navigator.clipboard.writeText(roomId);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	{
		if (!isInRoom) {
			return (
				<>
					<div className="fixed inset-0 bg-gradient-to-br from-indigo-50 to-purple-100 flex items-center justify-center overflow-hidden">
						<div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md mx-auto h-auto max-h-full overflow-y-auto">

							<div className="text-center mb-8">
								<div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-600 rounded-full mb-4">
									<Users className="w-8 h-8 text-white" />
								</div>
								<h1 className="text-3xl font-bold text-gray-800 mb-2">KIOSK Telemed</h1>
								<p className="text-gray-600">ระบบสนทนาทางไกลสำหรับบริการทางการแพทย์</p>
							</div>

							{/* เลือกบทบาทด้วย Dropdown */}
							<div className="mb-6">
								<label className="block text-sm font-medium text-gray-700 mb-2">
									บทบาทของคุณ
								</label>

								{/* Custom Dropdown with Icons */}
								<div className="relative">
									<button
										type="button"
										onClick={() => setIsRoleDropdownOpen(!isRoleDropdownOpen)}
										className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition flex items-center justify-between text-left"
									>
										<div className="flex items-center gap-3">
											{userRole === 'host' ? (
												<>
													<Crown className="w-5 h-5 text-yellow-600" />
													<span>Host (ผู้ดูแลห้อง)</span>
												</>
											) : (
												<>
													<User className="w-5 h-5 text-blue-600" />
													<span>Client (ผู้เข้าร่วมห้อง)</span>
												</>
											)}
										</div>
										<svg className={`w-5 h-5 text-gray-400 transition-transform ${isRoleDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
										</svg>
									</button>

									{/* Dropdown Menu */}
									{isRoleDropdownOpen && (
										<div className="absolute z-10 w-full mt-2 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
											<button
												onClick={() => {
													setUserRole('client');
													localStorage.setItem('userRole', 'client');
													setIsRoleDropdownOpen(false);
												}}
												className={`w-full px-4 py-3 flex items-center gap-3 hover:bg-indigo-50 transition ${userRole === 'client' ? 'bg-indigo-50' : ''}`}
											>
												<User className="w-5 h-5 text-blue-600" />
												<span>Client (ผู้เข้าร่วมห้อง)</span>
												{userRole === 'client' && <Check className="w-5 h-5 text-indigo-600 ml-auto" />}
											</button>
											<button
												onClick={() => {
													setUserRole('host');
													localStorage.setItem('userRole', 'host');
													setIsRoleDropdownOpen(false);
												}}
												className={`w-full px-4 py-3 flex items-center gap-3 hover:bg-indigo-50 transition ${userRole === 'host' ? 'bg-indigo-50' : ''}`}
											>
												<Crown className="w-5 h-5 text-yellow-600" />
												<span>Host (ผู้ดูแลห้อง)</span>
												{userRole === 'host' && <Check className="w-5 h-5 text-indigo-600 ml-auto" />}
											</button>
										</div>
									)}
								</div>
							</div>

							{/* สถานที่ */}
							{selectedLocation ? (
								<div className="mb-6 p-4 bg-indigo-50 border border-indigo-200 rounded-lg flex items-center justify-between">
									<div className="flex items-center gap-3">
										<Building2 className="w-8 h-8 text-indigo-600" />
										<div>
											<p className="text-sm text-indigo-700 font-medium">สถานที่ปัจจุบัน</p>
											<p className="font-semibold text-indigo-900">{selectedLocation.name}</p>
										</div>
									</div>
									<button onClick={() => setShowLocationSettings(true)} className="text-indigo-600 hover:text-indigo-800">
										<Settings className="w-5 h-5" />
									</button>
								</div>
							) : (
								<div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-center">
									<p className="text-yellow-800 font-medium mb-3">ยังไม่ได้เลือกสถานที่</p>
									<button onClick={() => setShowLocationSettings(true)} className="px-6 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg text-sm font-medium">
										ตั้งค่าสถานที่
									</button>
								</div>
							)}

							{connectionStatus === 'disconnected' && (
								<div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-lg mb-4 flex items-center gap-2">
									<div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent"></div>
									<span>กำลังเชื่อมต่อ PeerJS Server...</span>
								</div>
							)}

							{error && (
								<div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
									{error}
								</div>
							)}

							{connectionStatus === 'ready' && selectedLocation && (
								<div className="space-y-4">
									<div>
										<label className="block text-sm font-medium text-gray-700 mb-2">ชื่อของคุณ</label>
										<input
											type="text"
											value={userName}
											onChange={(e) => setUserName(e.target.value)}
											placeholder="กรอกชื่อของคุณ"
											className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition"
										/>
									</div>

									{/* Host: สร้างห้อง */}
									{userRole === 'host' && (
										<>
											<div>
												<label className="block text-sm font-medium text-gray-700 mb-2">รหัสห้อง</label>
												<div className="flex gap-2">
													<input
														type="text"
														value={roomId}
														onChange={(e) => setRoomId(e.target.value.toUpperCase())}
														placeholder="กรอกหรือสร้างรหัส"
														className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none uppercase font-mono"
													/>
													<button onClick={generateRoomId} className="px-4 py-3 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-lg font-medium">
														สร้าง
													</button>
												</div>
											</div>
											<button
												onClick={() => joinOrCreateRoom()}
												disabled={!roomId || connectionStatus === 'connecting'}
												className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white font-semibold py-3 rounded-lg transition flex items-center justify-center gap-2"
											>
												<Crown className="w-5 h-5" />
												สร้างและเปิดห้อง
											</button>
										</>
									)}

									{/* Client: เลือกห้องจากที่มีอยู่ */}
									{userRole === 'client' && (
										<>
											<div>
												<label className="block text-sm font-medium text-gray-700 mb-3">ห้องที่เปิดอยู่</label>
												{loadingRooms ? (
													<p className="text-center text-gray-500 py-4">กำลังโหลดห้อง...</p>
												) : availableRooms.length === 0 ? (
													<div className="text-center py-8 bg-gray-50 rounded-lg border border-gray-200">
														<Users className="w-12 h-12 mx-auto text-gray-400 mb-3" />
														<p className="text-gray-600">ยังไม่มีห้องที่เปิดอยู่ในสถานที่นี้</p>
														<p className="text-sm text-gray-500 mt-2">กรุณารอเจ้าหน้าที่สร้างห้อง</p>
													</div>
												) : (
													<div className="space-y-3 max-h-64 overflow-y-auto">
														{availableRooms.map((room) => (
															<button
																key={room.roomId}
																onClick={() => joinOrCreateRoom(room.roomId)}
																className="w-full p-4 bg-white hover:bg-indigo-50 border border-gray-300 rounded-lg text-left transition shadow-sm flex items-center justify-between group"
															>
																<div>
																	<p className="font-semibold text-gray-900 group-hover:text-indigo-700">{room.roomId}</p>
																	<p className="text-sm text-gray-500">สร้างเมื่อ {new Date(room.createdAt).toLocaleString('th-TH')}</p>
																</div>
																<span className="text-indigo-600 font-medium">เข้าร่วม →</span>
															</button>
														))}
													</div>
												)}
											</div>
										</>
									)}
								</div>
							)}

							<div className="mt-6 text-center text-xs text-gray-500">
								<p>ระบบจะบันทึกบทบาทและสถานที่ที่เลือกไว้ในเครื่องของผู้ใช้โดยอัตโนมัติ</p>
							</div>
						</div>
					</div>

					{/* Modal ตั้งค่าสถานที่ */}
					{showLocationSettings && (
						<LocationSettings
							onClose={() => setShowLocationSettings(false)}
							onSelectLocation={(location) => {
								setSelectedLocation(location);
								localStorage.setItem('selectedLocation', JSON.stringify(location));
							}}
						/>
					)}
				</>
			);
		}
	}

	return (
		<div className="fixed inset-0 bg-gray-900 flex flex-col">
			<div className="bg-gray-800 border-b border-gray-700 px-6 py-4">
				<div className="flex items-center justify-between flex-wrap gap-4">
					<div className="flex items-center gap-4">
						<div className="flex items-center gap-2">
							{isHost ? (
								<Crown className="w-5 h-5 text-yellow-400" />
							) : (
								<User className="w-5 h-5 text-blue-400" />
							)}
							<span className="text-white font-medium font-mono">
								{roomId}
							</span>
							{isHost && (
								<span className="text-xs bg-yellow-500 text-gray-900 px-2 py-1 rounded font-semibold">
									HOST
								</span>
							)}
						</div>
						<button
							onClick={copyRoomId}
							className="flex items-center gap-2 px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded-lg transition text-white text-sm"
						>
							{copied ? (
								<>
									<Check className="w-4 h-4" />
									<span>คัดลอกแล้ว!</span>
								</>
							) : (
								<>
									<Copy className="w-4 h-4" />
									<span>คัดลอก</span>
								</>
							)}
						</button>
					</div>
					<div className="flex items-center gap-3">
						<div className="flex items-center gap-2">
							<Users className="w-4 h-4 text-gray-400" />
							<span className="text-gray-300 text-sm">
								{participants.length} คน
							</span>
						</div>
						<div className={`w-2 h-2 rounded-full ${participants.length > 1 ? 'bg-green-500' : 'bg-yellow-500'}`} />
						<span className="text-gray-300 text-sm">
							{participants.length > 1 ? 'กำลังสนทนา' : 'รอผู้ใช้อื่น...'}
						</span>
					</div>
				</div>
			</div>

			{/* แสดงสถานที่ในห้อง */}
			{selectedLocation && (
				<div className="bg-indigo-900 text-white px-6 py-2 text-center">
					<div className="flex items-center justify-center gap-2">
						<Building2 className="w-5 h-5" />
						<span className="font-medium">{selectedLocation.name}</span>
					</div>
				</div>
			)}

			{/* ส่วนวิดีโอและ control เดิมทั้งหมด */}
			<div className="flex-1 p-6 overflow-auto">
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
					{/* Local video */}
					<div className="relative bg-gray-800 rounded-2xl overflow-hidden shadow-2xl min-h-[300px]">
						<video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover mirror" />
						{!isVideoEnabled && (
							<div className="absolute inset-0 flex items-center justify-center bg-gray-900">
								<VideoOff className="w-16 h-16 text-gray-600" />
							</div>
						)}
						<div className="absolute top-4 right-4">
							{isHost && (
								<div className="bg-yellow-500 text-gray-900 px-2 py-1 rounded text-xs font-bold">
									HOST
								</div>
							)}
						</div>
						<div className="absolute bottom-4 left-4 bg-black bg-opacity-60 px-3 py-2 rounded-lg flex items-center gap-2">
							{isHost && <Crown className="w-4 h-4 text-yellow-400" />}
							<span className="text-white text-sm font-medium">{userName} (คุณ)</span>
						</div>
					</div>

					<div id="remote-videos" className="grid grid-cols-1 gap-6 contents"></div>
				</div>
			</div>

			{/* Control bar เดิม */}
			<div className="bg-gray-800 border-t border-gray-700 px-6 py-6">
				{/* ... control buttons เดิม ... */}
				<div className="flex items-center justify-center gap-4 flex-wrap">
					{/* toggleVideo, toggleAudio, leaveRoom */}
					<button onClick={toggleVideo} className={`p-4 rounded-full transition ${isVideoEnabled ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-600 hover:bg-red-700'}`}>
						{isVideoEnabled ? <Video className="w-6 h-6 text-white" /> : <VideoOff className="w-6 h-6 text-white" />}
					</button>
					<button onClick={toggleAudio} className={`p-4 rounded-full transition ${isAudioEnabled ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-600 hover:bg-red-700'}`}>
						{isAudioEnabled ? <Mic className="w-6 h-6 text-white" /> : <MicOff className="w-6 h-6 text-white" />}
					</button>
					<button onClick={() => leaveRoom(true)} className="p-4 rounded-full bg-red-600 hover:bg-red-700 transition flex items-center gap-2 px-6">
						{isHost ? (
							<>
								<PhoneOff className="w-6 h-6 text-white" />
								<span className="text-white font-medium">ปิดห้อง</span>
							</>
						) : (
							<>
								<LogOut className="w-6 h-6 text-white" />
								<span className="text-white font-medium">ออกจากห้อง</span>
							</>
						)}
					</button>
				</div>

				{/* ข้อความเดิม */}
				{isHost && participants.length === 1 && (
					<div className="mt-4 text-center">
						<p className="text-gray-400 text-sm">
							แชร์รหัสห้อง <span className="font-mono font-bold text-white">{roomId}</span> ให้เพื่อนเพื่อเข้าร่วม
						</p>
					</div>
				)}
			</div>

			<style>{`
        .mirror { transform: scaleX(-1); }
        #remote-videos > div { min-height: 300px; }
      `}</style>
		</div>
	);
};

export default PeerJSRoomVideoCall;