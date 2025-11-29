// Menggunakan URL CDN untuk VS Code tanpa instalasi Node.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
// TAMBAHAN: Import Storage
import { getStorage } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-storage.js";

// KONFIGURASI FIREBASE (ZUVO APP)
const firebaseConfig = {
    apiKey: "AIzaSyCv_feVVtGypOxyUS5c51OpAnWZ86XwfPc",
    authDomain: "zuvo-app-121a4.firebaseapp.com",
    projectId: "zuvo-app-121a4",
    storageBucket: "zuvo-app-121a4.firebasestorage.app",
    messagingSenderId: "725796778650",
    appId: "1:725796778650:web:f0400d85480d003cf06523",
    measurementId: "G-VDSEPN4CXM"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app); // Initialize Storage

// PENTING: Export storage agar bisa dipakai di app.js
export { auth, db, storage };