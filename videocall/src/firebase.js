// src/firebase.js
import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

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

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

export { app, database };