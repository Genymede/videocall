// src/firebase.js
import { initializeApp } from "firebase/app";
import { 
  getDatabase, 
  ref, 
  set, 
  get, 
  remove, 
  onValue, 
  onDisconnect 
} from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyD6GeERDZY8FQnRkr4oT4AqQIdOhypn-V0",
  authDomain: "peerjs-video-call.firebaseapp.com",
  databaseURL: "https://peerjs-video-call-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "peerjs-video-call",
  storageBucket: "peerjs-video-call.appspot.com",
  messagingSenderId: "418405695038",
  appId: "1:418405695038:web:aa91dd36916887a0f05b6f"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);

export const roomRef = (roomId) => ref(db, `rooms/${roomId}`);
export const hostRef = (roomId) => ref(db, `rooms/${roomId}/hostPeerId`); 