import React, { useState, useEffect, useRef } from 'react';
import { Video, VideoOff, Mic, MicOff, Phone, PhoneOff, Copy, Users, UserPlus, LogOut, Crown, User, Check } from 'lucide-react';

// --- เพิ่ม Firebase ---
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, get, remove, onValue, off } from 'firebase/database';

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

	const localVideoRef = useRef(null);
	const peerRef = useRef(null);
	const localStreamRef = useRef(null);
	const callsRef = useRef({});
	const dataConnectionsRef = useRef({});
	const roomStateRef = useRef({
		hostPeerId: null,
		participants: []
	});

	// เพิ่ม ref สำหรับ Firebase listener
	const roomHostListenerRef = useRef(null);

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
                    
                    // New: Xirsys (Often used for additional TCP relay flexibility)
                    // Note: Xirsys credentials usually require a dynamic API call, 
                    // but we include common public servers for maximum compatibility.
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

	const generateRoomId = () => {
		const id = Math.random().toString(36).substring(2, 8).toUpperCase();
		setRoomId(id);
	};

	const joinRoom = async () => {
		if (!roomId || !userName) {
			setError('กรุณากรอกรหัสห้องและชื่อของคุณ');
			return;
		}

		try {
			setConnectionStatus('connecting');
			setError('');

			const stream = await navigator.mediaDevices.getUserMedia({
				video: true,
				audio: true
			});

			localStreamRef.current = stream;
			if (localVideoRef.current) {
				localVideoRef.current.srcObject = stream;
			}

			const roomRef = ref(database, `rooms/${roomId}`);

			const snapshot = await get(roomRef);
			const hostPeerId = snapshot.val()?.hostPeerId;

			if (!hostPeerId || hostPeerId === myPeerId) {
				console.log('Creating new room as host');
				await set(roomRef, {
					hostPeerId: myPeerId,
					createdAt: Date.now()
				});

				roomStateRef.current = {
					roomId,
					hostPeerId: myPeerId,
					participants: [{
						peerId: myPeerId,
						name: userName,
						isHost: true
					}]
				};

				setIsHost(true);
				setParticipants(roomStateRef.current.participants);
				setIsInRoom(true);
				setConnectionStatus('waiting');

			} else {
				console.log('Joining existing room, host:', hostPeerId);
				setIsHost(false);

				const dataConn = peerRef.current.connect(hostPeerId, {
					reliable: true,
					metadata: { name: userName, roomId }
				});

				setupDataConnection(dataConn);

				dataConn.on('open', () => {
					console.log('Connected to host, requesting room state');

					dataConn.send({
						type: 'join-request',
						payload: {
							peerId: myPeerId,
							name: userName,
							isHost: false
						}
					});

					callPeer(hostPeerId, 'Host');
				});

				setIsInRoom(true);
				setConnectionStatus('connected');
			}

			// ติดตามสถานะ host (ถ้า host หาย = ปิดห้อง)
			roomHostListenerRef.current = roomRef;
			onValue(roomRef, (snap) => {
				if (!snap.exists() && isInRoom) {
					console.log('Room deleted by host');
					setError('Host ปิดห้องแล้ว');
					setTimeout(() => leaveRoom(false), 2000);
				}
			});

		} catch (err) {
			console.error('Error joining room:', err);
			setError('ไม่สามารถเข้าถึงกล้องหรือไมค์: ' + err.message);
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
				console.log('Host leaving, closing room');
				// ลบห้องออกจาก Firebase
				const roomRef = ref(database, `rooms/${roomId}`);
				await remove(roomRef);

				broadcastToAll({
					type: 'host-leaving',
					payload: { roomId }
				});
			} else {
				console.log('Client leaving room');

				sendToHost({
					type: 'participant-left',
					payload: { peerId: myPeerId, name: userName }
				});
			}
		}

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

	// UI ส่วนที่เหลือเหมือนเดิมทุกประการ...
	// (ไม่มีการเปลี่ยนแปลงใด ๆ ด้านล่างนี้)

	if (!isInRoom) {
		return (
			<div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-100 flex items-center justify-center p-4">
				<div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
					<div className="text-center mb-8">
						<div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-600 rounded-full mb-4">
							<Users className="w-8 h-8 text-white" />
						</div>
						<h1 className="text-3xl font-bold text-gray-800 mb-2">PeerJS Room Call</h1>
						<p className="text-gray-600">P2P • ไม่ต้องเซิร์ฟเวอร์ • ข้ามเครือข่ายได้</p>
					</div>

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

					{connectionStatus === 'ready' && (
						<div className="space-y-4">
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-2">
									ชื่อของคุณ
								</label>
								<input
									type="text"
									value={userName}
									onChange={(e) => setUserName(e.target.value)}
									placeholder="กรอกชื่อของคุณ"
									className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
								/>
							</div>

							<div>
								<label className="block text-sm font-medium text-gray-700 mb-2">
									รหัสห้อง
								</label>
								<div className="flex gap-2">
									<input
										type="text"
										value={roomId}
										onChange={(e) => setRoomId(e.target.value.toUpperCase())}
										placeholder="กรอกหรือสร้างรหัสห้อง"
										className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition uppercase font-mono"
									/>
									<button
										onClick={generateRoomId}
										className="px-4 py-3 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-lg transition font-medium"
									>
										สร้าง
									</button>
								</div>
							</div>

							<button
								onClick={joinRoom}
								disabled={connectionStatus === 'connecting'}
								className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white font-semibold py-3 rounded-lg transition shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
							>
								<UserPlus className="w-5 h-5" />
								{connectionStatus === 'connecting' ? 'กำลังเข้าร่วม...' : 'เข้าร่วมห้อง'}
							</button>
						</div>
					)}

					{/* ส่วนข้อมูลเพิ่มเติมเหมือนเดิม */}
					<div className="mt-6 space-y-3">
						<div className="p-4 bg-green-50 rounded-lg border border-green-200">
							<p className="text-sm text-green-800 font-semibold mb-2 flex items-center gap-2">
								<Check className="w-4 h-4" />
								ระบบห้องอัตโนมัติ:
							</p>
							<ul className="text-sm text-green-700 space-y-1 ml-6 list-disc">
								<li>รหัสใหม่ = สร้างห้อง (Host)</li>
								<li>รหัสเดิม = เข้าร่วม (Client)</li>
								<li>Host ออก = ปิดห้อง</li>
								<li>Client ออก = ออกจากห้อง</li>
							</ul>
						</div>

						{/* <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
							<p className="text-sm text-blue-800 font-semibold mb-2">
								ข้ามเครือข่ายได้จริง:
							</p>
							<ul className="text-sm text-blue-700 space-y-1 ml-6 list-disc">
								<li>PeerJS Cloud Server (ฟรี)</li>
								<li>STUN + TURN Servers (ฟรี)</li>
								<li>ไม่ต้องมี Public IP</li>
								<li>ทำงานข้ามประเทศได้</li>
							</ul>
						</div> */}

						<div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
							<p className="text-sm text-purple-800">
								<strong>คุณสมบัติ:</strong> ใช้ Firebase RTDB แทน localStorage
							</p>
						</div>
					</div>
				</div>
			</div>
		);
	}

	return (
		// UI ในห้องเหมือนเดิมทุกอย่าง...
		<div className="min-h-screen bg-gray-900 flex flex-col">
			{/* ... ส่วนที่เหลือเหมือนเดิม 100% ... */}
			{/* (ไม่มีการเปลี่ยนแปลงใด ๆ) */}
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
						<div className={`w-2 h-2 rounded-full ${participants.length > 1 ? 'bg-green-500' : 'bg-yellow-500'
							}`} />
						<span className="text-gray-300 text-sm">
							{participants.length > 1 ? 'กำลังสนทนา' : 'รอผู้ใช้อื่น...'}
						</span>
					</div>
				</div>
			</div>

			<div className="flex-1 p-6 overflow-auto">
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
					<div className="relative bg-gray-800 rounded-2xl overflow-hidden shadow-2xl min-h-[300px]">
						<video
							ref={localVideoRef}
							autoPlay
							playsInline
							muted
							className="w-full h-full object-cover mirror"
						/>
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

					<div id="remote-videos" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 contents"></div>
				</div>
			</div>

			<div className="bg-gray-800 border-t border-gray-700 px-6 py-6">
				<div className="flex items-center justify-center gap-4 flex-wrap">
					<button
						onClick={toggleVideo}
						className={`p-4 rounded-full transition ${isVideoEnabled
							? 'bg-gray-700 hover:bg-gray-600'
							: 'bg-red-600 hover:bg-red-700'
							}`}
						title={isVideoEnabled ? 'ปิดกล้อง' : 'เปิดกล้อง'}
					>
						{isVideoEnabled ? (
							<Video className="w-6 h-6 text-white" />
						) : (
							<VideoOff className="w-6 h-6 text-white" />
						)}
					</button>

					<button
						onClick={toggleAudio}
						className={`p-4 rounded-full transition ${isAudioEnabled
							? 'bg-gray-700 hover:bg-gray-600'
							: 'bg-red-600 hover:bg-red-700'
							}`}
						title={isAudioEnabled ? 'ปิดไมค์' : 'เปิดไมค์'}
					>
						{isAudioEnabled ? (
							<Mic className="w-6 h-6 text-white" />
						) : (
							<MicOff className="w-6 h-6 text-white" />
						)}
					</button>

					<button
						onClick={() => leaveRoom(true)}
						className="p-4 rounded-full bg-red-600 hover:bg-red-700 transition flex items-center gap-2 px-6"
						title={isHost ? 'ปิดห้อง' : 'ออกจากห้อง'}
					>
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

				{isHost && participants.length === 1 && (
					<div className="mt-4 text-center">
						<p className="text-gray-400 text-sm">
							แชร์รหัสห้อง <span className="font-mono font-bold text-white">{roomId}</span> ให้เพื่อนเพื่อเข้าร่วม
						</p>
					</div>
				)}

				{isHost && participants.length > 1 && (
					<div className="mt-4 text-center">
						<p className="text-yellow-400 text-sm">
							คุณเป็น Host - เมื่อกด "ปิดห้อง" จะปิดการสนทนาสำหรับทุกคน
						</p>
					</div>
				)}
			</div>

			<style>{`
        .mirror {
          transform: scaleX(-1);
        }
        #remote-videos > div {
          min-height: 300px;	 
        }
      `}</style>
		</div>
	);
};

export default PeerJSRoomVideoCall;