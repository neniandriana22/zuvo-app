// 1. IMPORT LENGKAP (Hapus import storage karena kita pakai Base64)
import { auth, db } from './firebase-config.js'; 

import { 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged,
    sendPasswordResetEmail // <--- TAMBAHKAN INI (JANGAN LUPA KOMA DI ATASNYA)
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

import { 
    collection, doc, setDoc, getDoc, getDocs, updateDoc, 
    deleteDoc, addDoc, query, where, arrayUnion, deleteField
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// ============================================================
// --- NAVBAR RESPONSIVE LOGIC (FIXED) ---
// ============================================================
const mobileBtn = document.getElementById('mobile-menu-btn');
const navMenu = document.getElementById('navbar-menu');

if (mobileBtn && navMenu) {
    // 1. FIX: Cek Ukuran Layar Saat Pertama Kali Load
    // Ini mencegah menu hilang jika dibuka langsung di laptop
    if (window.innerWidth >= 768) {
        navMenu.classList.remove('hidden');
        navMenu.classList.add('flex');
    }

    // 2. Klik Tombol Hamburger -> Buka/Tutup Menu
    mobileBtn.addEventListener('click', () => {
        navMenu.classList.toggle('hidden');
        navMenu.classList.toggle('flex');
    });

    // 3. Klik Salah Satu Menu -> Tutup Menu (Khusus Mobile)
    const menuLinks = navMenu.querySelectorAll('button');
    menuLinks.forEach(link => {
        link.addEventListener('click', () => {
            if (window.innerWidth < 768) {
                navMenu.classList.add('hidden');
                navMenu.classList.remove('flex');
            }
        });
    });

    // 4. Pantau Perubahan Ukuran Layar (Resize)
    window.addEventListener('resize', () => {
        if (window.innerWidth >= 768) {
            // Jika layar melebar jadi Desktop, PAKSA menu muncul
            navMenu.classList.remove('hidden');
            navMenu.classList.add('flex');
        } else {
            // Jika mengecil jadi HP, reset jadi tertutup (rapi)
            navMenu.classList.add('hidden');
            navMenu.classList.remove('flex');
        }
    });
}
// ============================================================

// ... (Lanjutkan dengan kode HELPER dan AUTH FUNCTIONS di bawahnya) ...

// ============================================================

// --- GLOBAL VARIABLES ---
// --- HELPER: UBAH FOTO JADI TEKS (BASE64) ---
// --- HELPER: UBAH FOTO JADI TEKS (BASE64) ---
const convertToBase64 = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
};

let currentUser = null;
let userData = null;
let currentDestId = null;

// Nama koleksi database
const COLL_USERS = "users";
const COLL_DESTINATIONS = "destinations";
const COLL_REVIEWS = "reviews";

// --- AUTH LISTENER (Cek Login) ---
// --- AUTH LISTENER (Cek Login) ---
// --- AUTH LISTENER (Cek Login & Status Blokir) ---
// --- AUTH LISTENER (REVISI FINAL: Cek Login, Status Blokir & Anti-Crash Register) ---
onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    
    if (user) {
        // Ambil data profil dari Firestore
        const docRef = doc(db, COLL_USERS, user.uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            userData = docSnap.data();

            // 1. Cek jika statusnya 'blocked'
            if (userData.status === 'blocked') {
                await signOut(auth);
                userData = null;
                alert("AKSES DITOLAK: Akun Anda telah diblokir sementara oleh Admin.\nSilakan hubungi dukungan kami.");
                window.navigate('login');
                return;
            }

            // Jika aman, update UI
            updateNavUI(true, userData.name, userData.role, userData.photoURL);
            
            // Redirect logic (tetap sama)
            const currentView = document.querySelector('.view-section:not(.hidden)').id;
            if(currentView === 'view-login' || currentView === 'view-register') {
                if(userData.role === 'admin') navigate('admin');
                else if(userData.role === 'manager') navigate('manager');
                else navigate('home');
            }

        } else {
            // --- [PERBAIKAN UTAMA DISINI] ---
            // Cek umur akun. Jika baru dibuat < 10 detik yang lalu, JANGAN DI-KICK.
            // Ini memberi waktu agar fungsi Register sempat menyimpan data ke Firestore.
            const creationTime = new Date(user.metadata.creationTime).getTime();
            const now = new Date().getTime();
            
            // Beri toleransi 15 detik untuk proses registrasi
            if (now - creationTime < 15000) {
                console.log("User baru mendaftar, menunggu data Firestore dibuat...");
                return; // Biarkan lewat, jangan logout!
            }

            // Jika akun sudah lama TAPI datanya tidak ada, baru dianggap DIHAPUS ADMIN
            await signOut(auth);
            userData = null;
            alert("AKUN TIDAK DITEMUKAN: Akun Anda telah dihapus oleh Admin.");
            window.navigate('login');
        }
    } else {
        // Posisi Logout
        userData = null;
        updateNavUI(false);
    }
});

// --- TAMBAHAN BARU: INITIAL LOAD ---
// Panggil fungsi renderDestinations() setelah dokumen siap dimuat.

document.addEventListener('DOMContentLoaded', () => {
    // Cek apakah user sudah login atau belum di listener onAuthStateChanged
    // Kita tunggu onAuthStateChanged selesai melakukan pengecekan user/redirect
    setTimeout(() => {
        // Jika user tidak terautentikasi (belum login) dan berada di halaman home
        if (!currentUser && document.getElementById('view-home').classList.contains('view-section')) {
             renderDestinations();
        }
    }, 500); // Beri sedikit waktu tunggu agar semua elemen HTML/Firebase siap
});

// --- NAVIGATION SYSTEM ---
// Membuat fungsi navigate tersedia secara global untuk tombol HTML
// --- NAVIGATION SYSTEM ---
window.navigate = (viewId) => {
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
    const target = document.getElementById(`view-${viewId}`);
    if(target) {
        target.classList.remove('hidden');
        window.scrollTo(0,0);
        
        // Trigger load data sesuai halaman
        if(viewId === 'home') renderDestinations();
        if(viewId === 'admin' && userData?.role === 'admin') renderAdminUsers();
        if(viewId === 'manager' && userData?.role === 'manager') loadManagerData();
        if(viewId === 'profile') loadUserProfile();
        
        // Tidak perlu logika khusus untuk 'docs' karena hanya konten statis HTML
    }
};

// Event Listener untuk Navigasi (Pengganti onclick HTML agar modul rapi)
document.getElementById('nav-home').addEventListener('click', () => window.navigate('home'));
document.getElementById('nav-logo').addEventListener('click', () => window.navigate('home'));
document.getElementById('nav-login').addEventListener('click', () => window.navigate('login'));
document.getElementById('nav-register').addEventListener('click', () => window.navigate('register'));
document.getElementById('btn-dashboard').addEventListener('click', () => {
    if(userData.role === 'admin') window.navigate('admin');
    else if(userData.role === 'manager') window.navigate('manager');
});

document.querySelector('#auth-menu .group button').addEventListener('click', () => {
    window.navigate('profile'); // Navigasi ke halaman profil baru
});

// Update window.navigate untuk handle 'profile'
const originalNavigate = window.navigate;
window.navigate = (viewId) => {
    originalNavigate(viewId); // Jalankan logika lama
    
    // Tambahan logika baru
    if (viewId === 'profile') loadUserProfile();
};

document.getElementById('link-to-register').addEventListener('click', (e) => { e.preventDefault(); window.navigate('register'); });
document.getElementById('btn-back-home').addEventListener('click', () => window.navigate('home'));

const btnLinkLogin = document.getElementById('link-to-login');
if(btnLinkLogin) {
    btnLinkLogin.addEventListener('click', (e) => {
        e.preventDefault(); // Mencegah refresh halaman
        window.navigate('login'); // Pindah ke halaman login
    });
}

// --- UI HELPERS ---
// --- UI HELPERS ---
function updateNavUI(isLoggedIn, name = '', role = '', photoURL = '') {
    const authMenu = document.getElementById('auth-menu');
    const guestMenu = document.getElementById('guest-menu');
    const btnDashboard = document.getElementById('btn-dashboard');
    const navName = document.getElementById('nav-username');
    const navImgContainer = document.getElementById('nav-img-container'); // Ambil elemen container gambar

    if (isLoggedIn) {
        authMenu.classList.remove('hidden');
        guestMenu.classList.add('hidden');
        navName.textContent = name;

        // LOGIKA BARU: Tampilkan Foto Profil di Navbar
        if (photoURL && photoURL.length > 20) { // Cek validasi sederhana apakah URL base64/link valid
            // Jika ada foto, ganti isi div dengan tag IMG
            navImgContainer.innerHTML = `<img src="${photoURL}" class="w-full h-full object-cover">`;
            // Hapus class background bawaan agar tidak bertumpuk
            navImgContainer.classList.remove('bg-sky-100', 'text-sky-600'); 
        } else {
            // Jika tidak ada foto, gunakan API UI Avatars (Inisial Nama) atau Icon Default
            // Opsi 1: Pakai Icon User Default
            // navImgContainer.innerHTML = `<i class="fa-solid fa-user text-sm"></i>`;
            
            // Opsi 2 (Lebih Bagus): Pakai Inisial Nama (misal "Budi Santoso" jadi "BS")
            navImgContainer.innerHTML = `<img src="https://ui-avatars.com/api/?name=${name}&background=random&color=fff" class="w-full h-full object-cover">`;
            
            navImgContainer.classList.add('bg-sky-100', 'text-sky-600');
        }

        // Logika Tombol Dashboard
        if (role === 'admin' || role === 'manager') {
            btnDashboard.classList.remove('hidden');
        } else {
            btnDashboard.classList.add('hidden');
        }
    } else {
        authMenu.classList.add('hidden');
        guestMenu.classList.remove('hidden');
        
        // Reset ikon ke default saat logout
        if(navImgContainer) {
            navImgContainer.innerHTML = `<i class="fa-solid fa-user text-sm"></i>`;
            navImgContainer.classList.add('bg-sky-100', 'text-sky-600');
        }
    }
}

// --- UI HELPER: FUNGSI NOTIFIKASI RAHMAT (DENGAN TERJEMAHAN ERROR) ---
function showToast(msg, type = 'success') {
    const toast = document.getElementById('toast');
    const msgEl = document.getElementById('toast-msg');
    const iconEl = document.getElementById('toast-icon');

    // 1. Logika Penerjemahan Error Firebase
    let translatedMsg = msg;
    if (msg.includes('Firebase: Error')) {
        if (msg.includes('auth/email-already-in-use')) {
            translatedMsg = 'Email ini sudah terdaftar. Silakan login.';
        } else if (msg.includes('auth/invalid-email')) {
            translatedMsg = 'Format email tidak valid. Cek kembali.';
        } else if (msg.includes('auth/weak-password')) {
            translatedMsg = 'Password terlalu lemah. Minimal 6 karakter.';
        
        // --- KODE BARU: Memisahkan Salah Password vs Belum Daftar ---
        } else if (msg.includes('auth/wrong-password')) {
            translatedMsg = 'Kata sandi salah. Coba lagi.';
        } else if (msg.includes('auth/user-not-found')) {
            translatedMsg = 'Email belum terdaftar. Silakan daftar akun baru.';
        
        // --- KODE BARU: Menangani Error Umum Firebase Terbaru ---
        } else if (msg.includes('auth/invalid-credential')) {
            // Catatan: Firebase versi baru sering menyatukan error di atas menjadi ini demi keamanan
            translatedMsg = 'Email atau kata sandi salah.';
        } else if (msg.includes('auth/too-many-requests')) {
            translatedMsg = 'Terlalu banyak percobaan login. Tunggu sebentar.';
        } else {
            translatedMsg = 'Terjadi kesalahan pada sistem login.';
        }
        type = 'error';
    }

    if(msgEl && iconEl && toast) {
        msgEl.textContent = translatedMsg;
        iconEl.className = type === 'error' ? 'fa-solid fa-circle-xmark text-red-400 mr-3' : 'fa-solid fa-check-circle text-green-400 mr-3';
        toast.classList.remove('translate-y-40');
        
        // Atur warna toast untuk error
        if (type === 'error') {
            toast.classList.add('bg-red-700');
            toast.classList.remove('bg-slate-800');
        } else {
            toast.classList.add('bg-slate-800');
            toast.classList.remove('bg-red-700');
        }

        setTimeout(() => toast.classList.add('translate-y-40'), 5000); // Tampilkan lebih lama
    } else {
        alert(translatedMsg);
    }
}

// --- AUTH FUNCTIONS ---

// 1. LOGIKA TOGGLE PASSWORD & VALIDASI (BARU)
// ---------------------------------------------------------------
// Toggle Lihat Password
window.togglePasswordVisibility = (inputId, iconEl) => {
    const input = document.getElementById(inputId);
    const icon = iconEl.querySelector('i');
    if (input.type === "password") {
        input.type = "text";
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        input.type = "password";
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
};

// Regex Patterns
const REGEX_NAME = /^[a-zA-Z\s]+$/; // Hanya huruf dan spasi
const REGEX_PASS_LENGTH = /.{8,}/;
const REGEX_PASS_UPPER = /[A-Z]/;
const REGEX_PASS_LOWER = /[a-z]/;
const REGEX_PASS_NUM = /[0-9]/;
// Tanda hubung (-) dipindah ke paling belakang agar tidak dianggap range
const REGEX_PASS_SPECIAL = /[!@#$%^&*(),.?":{}|<>\-_]/;

// Real-time Validation Logic
const nameInput = document.getElementById('reg-name');
const passInput = document.getElementById('reg-password');
const errName = document.getElementById('err-name');
const passRulesBox = document.getElementById('password-rules');

// Validasi Nama saat mengetik
if(nameInput) {
    nameInput.addEventListener('input', function() {
        if (!REGEX_NAME.test(this.value) && this.value !== "") {
            if(errName) errName.classList.remove('hidden');
            this.classList.add('border-red-500', 'focus:ring-red-200');
            this.classList.remove('focus:ring-sky-200');
        } else {
            if(errName) errName.classList.add('hidden');
            this.classList.remove('border-red-500', 'focus:ring-red-200');
            this.classList.add('focus:ring-sky-200');
        }
    });
}

// Validasi Password saat mengetik
function checkPasswordStrength(password) {
    const updateRule = (id, isValid) => {
        const el = document.getElementById(id);
        if(!el) return false;
        const icon = el.querySelector('i');
        if (isValid) {
            el.classList.remove('text-slate-400');
            el.classList.add('text-green-600', 'font-bold');
            icon.classList.remove('fa-circle', 'text-[6px]');
            icon.classList.add('fa-check', 'text-xs');
        } else {
            el.classList.add('text-slate-400');
            el.classList.remove('text-green-600', 'font-bold');
            icon.classList.add('fa-circle', 'text-[6px]');
            icon.classList.remove('fa-check', 'text-xs');
        }
        return isValid;
    };

    const vLength = updateRule('rule-length', REGEX_PASS_LENGTH.test(password));
    const vUpper = updateRule('rule-upper', REGEX_PASS_UPPER.test(password));
    const vLower = updateRule('rule-lower', REGEX_PASS_LOWER.test(password));
    const vNum = updateRule('rule-number', REGEX_PASS_NUM.test(password));
    const vSpecial = updateRule('rule-special', REGEX_PASS_SPECIAL.test(password));

    return vLength && vUpper && vLower && vNum && vSpecial;
}

if(passInput) {
    passInput.addEventListener('focus', () => {
        if(passRulesBox) passRulesBox.classList.remove('hidden');
    });
    
    passInput.addEventListener('input', function() {
        checkPasswordStrength(this.value);
    });
    
    passInput.addEventListener('blur', () => {
        // Sembunyikan box jika valid, jika belum biarkan user melihat
        if(checkPasswordStrength(passInput.value) && passRulesBox) {
            passRulesBox.classList.add('hidden');
        }
    });
}
// ---------------------------------------------------------------


document.getElementById('btn-logout').addEventListener('click', async () => {
    if(confirm("Yakin ingin keluar?")) {
        await signOut(auth);
        window.navigate('home');
        showToast("Berhasil Logout");
    }
});

// ... (Kode sebelumnya)

document.getElementById('form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-password').value;
    
    // UI Loading (Tidak merubah fungsi utama, hanya UX)
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Memuat...';
    btn.disabled = true;

    try {
        // 1. Login dulu ke Firebase Auth (Cek Email & Password)
        const userCredential = await signInWithEmailAndPassword(auth, email, pass);
        const user = userCredential.user;
        
        // --- LOGIKA UTAMA: CEK STATUS SEBELUM NOTIF ---
        // Kita intip dulu datanya di Database. 
        const docRef = doc(db, COLL_USERS, user.uid);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            const uData = docSnap.data();
            // Jika statusnya 'blocked', BERHENTI DI SINI.
            if (uData.status === 'blocked') {
                // Return akan menghentikan fungsi, jadi baris showToast di bawah TIDAK AKAN DIJALANKAN.
                // Nanti sistem 'onAuthStateChanged' yang akan menangani alert "Akses Ditolak" & logout paksa.
                return; 
            }
        }
        // ----------------------------------------------

        // 3. Jika aman (tidak diblokir/return), baru munculkan notifikasi sukses
        showToast("Login Berhasil");
        
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        // Reset tombol kembali normal
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
});

// ... (Kode selanjutnya)

// --- FITUR LUPA PASSWORD ---

// 1. Navigasi ke halaman Lupa Password
const btnLinkForgot = document.getElementById('link-to-forgot');
if(btnLinkForgot) {
    btnLinkForgot.addEventListener('click', (e) => {
        e.preventDefault();
        window.navigate('forgot-password');
    });
}

// 2. Navigasi Kembali ke Login
const btnBackLogin = document.getElementById('link-back-login');
if(btnBackLogin) {
    btnBackLogin.addEventListener('click', (e) => {
        e.preventDefault();
        window.navigate('login');
    });
}

// 3. Proses Kirim Email Reset
const formForgot = document.getElementById('form-forgot-password');
if(formForgot) {
    formForgot.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const emailInput = document.getElementById('forgot-email');
        const email = emailInput.value.trim();
        const btn = e.target.querySelector('button');
        const originalText = btn.innerHTML;
        
        if(!email) return showToast("Mohon isi email Anda.", "error");

        // Ubah tombol jadi loading
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Mengirim...';
        btn.disabled = true;

        try {
            await sendPasswordResetEmail(auth, email);
            
            // Tampilkan pesan sukses
            alert(`Sukses! Link reset password telah dikirim ke ${email}.\n\nSilakan cek kotak masuk atau folder spam email Anda, lalu klik link tersebut untuk membuat password baru.`);
            
            // Kembalikan ke halaman login
            window.navigate('login');
            
        } catch (err) {
            console.error(err);
            let msg = "Gagal mengirim email.";
            if(err.code === 'auth/user-not-found') msg = "Email tidak terdaftar di sistem kami.";
            if(err.code === 'auth/invalid-email') msg = "Format email tidak valid.";
            
            showToast(msg, 'error');
        } finally {
            // Reset tombol
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    });
}

// Register Logic (DENGAN ANIMASI ROLE)
const btnUser = document.getElementById('btn-role-user');
const btnMgr = document.getElementById('btn-role-manager');
const mgrFields = document.getElementById('manager-fields');
const regRoleInput = document.getElementById('reg-role');
const roleIndicator = document.getElementById('role-indicator'); // Pastikan elemen ini ada di HTML

btnUser.addEventListener('click', () => {
    regRoleInput.value = 'user';
    mgrFields.classList.add('hidden');
    
    // Animasi & Style Baru
    if(roleIndicator) roleIndicator.style.transform = 'translateX(0)';
    btnUser.classList.add('text-sky-600'); // Active text color
    btnUser.classList.remove('text-slate-500');
    btnMgr.classList.remove('text-slate-700');
    btnMgr.classList.add('text-slate-500');
});

btnMgr.addEventListener('click', () => {
    regRoleInput.value = 'manager';
    mgrFields.classList.remove('hidden');
    
    // Animasi & Style Baru
    if(roleIndicator) roleIndicator.style.transform = 'translateX(100%)';
    btnMgr.classList.add('text-slate-700'); // Active text color
    btnMgr.classList.remove('text-slate-500');
    btnUser.classList.remove('text-sky-600');
    btnUser.classList.add('text-slate-500');
});

document.getElementById('form-register').addEventListener('submit', async (e) => {
    e.preventDefault();

    // 1. Ambil Elemen
    const emailEl = document.getElementById('reg-email');
    const passEl = document.getElementById('reg-password');
    const nameEl = document.getElementById('reg-name');
    const roleEl = document.getElementById('reg-role'); 

    // 2. Ambil Nilai
    const email = emailEl.value.trim();
    const pass = passEl.value;
    const name = nameEl.value.trim();
    const role = roleEl.value;

    // 3. Validasi Sederhana (KOSONG)
    if (!email || !pass || !name) {
        showToast("Mohon lengkapi nama, email, dan password!", "error");
        return;
    }

    // --- [BARU] VALIDASI LANJUTAN ---
    // Cek Nama (Hanya Huruf)
    if (!REGEX_NAME.test(name)) {
        showToast("Nama hanya boleh mengandung huruf dan spasi.", "error");
        nameEl.focus();
        return;
    }

    // Cek Password (Kompleksitas)
    if (!checkPasswordStrength(pass)) {
        showToast("Password belum memenuhi syarat keamanan (Huruf Besar, Kecil, Angka, Simbol).", "error");
        passEl.focus();
        if(passRulesBox) passRulesBox.classList.remove('hidden');
        return;
    }
    // ---------------------------------

    // Validasi Khusus Manager
    if (role === 'manager') {
        const destName = document.getElementById('reg-dest-name').value.trim();
        if (!destName) {
            showToast("Nama Destinasi wajib diisi untuk Pengelola!", "error");
            return;
        }
    }

    // Ubah tombol jadi loading
    const btnSubmit = e.target.querySelector('button[type="submit"]');
    const originalText = btnSubmit.innerHTML;
    btnSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Memproses...';
    btnSubmit.disabled = true;

    try {
        // A. Buat Akun di Authentication
        const cred = await createUserWithEmailAndPassword(auth, email, pass);
        const uid = cred.user.uid;

        // B. Siapkan Data User Profile
        const userDataObj = {
            uid: uid,
            name: name,
            email: email,
            role: role,
            status: role === 'manager' ? 'pending' : 'active', 
            createdAt: new Date().toISOString()
        };

        // C. Jika Role Manager, simpan juga ke koleksi 'destinations'
        if (role === 'manager') {
            const destName = document.getElementById('reg-dest-name').value;
            const contact = document.getElementById('reg-contact').value;
            const address = document.getElementById('reg-address').value;

            userDataObj.managerInfo = { destName, contact, address };
            
            await setDoc(doc(db, COLL_DESTINATIONS, uid), {
                managerId: uid,
                name: destName,
                address: address,
                contact: contact,
                description: "Deskripsi belum diisi",
                category: "Alam",
                image: "https://via.placeholder.com/400x300?text=No+Image",
                rating: 0,
                reviewCount: 0,
                lat: "",
                lng: "",
                status: "pending",
                isSetup: false
            });
        }

        // D. Simpan User Profile ke Firestore
        await setDoc(doc(db, COLL_USERS, uid), userDataObj);

        showToast('Registrasi Berhasil!');

        // Reset Form
        e.target.reset();

        // Redirect / Pesan
        if(role === 'manager') {
            alert("Akun berhasil dibuat! Mohon tunggu verifikasi Admin agar bisa login dan wisata Anda tampil.");
            await signOut(auth);
            window.navigate('login');
        } else {
            window.navigate('home');
        }
        
    } catch (err) {
        console.error("Error Register:", err);
        showToast(err.message, 'error');
    } finally {
        btnSubmit.innerHTML = originalText;
        btnSubmit.disabled = false;
    }
});

// --- HOME LOGIC ---
// --- HOME LOGIC (FIX: FOTO UTUH DENGAN BACKGROUND BLUR) ---
async function renderDestinations() {
    const list = document.getElementById('destination-list');
    
    // Ambil nilai inputan
    const search = document.getElementById('search-input').value.toLowerCase();
    const filter = document.getElementById('filter-category').value;
    const sortBy = document.getElementById('sort-options').value;

    list.innerHTML = '<div class="col-span-full text-center py-10"><i class="fa-solid fa-spinner fa-spin text-2xl text-slate-400"></i></div>';

    try {
        const snap = await getDocs(collection(db, COLL_DESTINATIONS));
        let destinations = [];
        
        snap.forEach(doc => {
            const d = doc.data();
            
            // --- LOGIKA PENYARINGAN UTAMA ---
            // 1. Cek Status Akun: Harus 'active' (sudah di-acc Admin)
            // 2. Cek Kesiapan Data: Harus 'isSetup === true' (sudah diedit Pengelola)
            const isActive = d.status === 'active';
            const isReady = d.isSetup === true;

            // Jika belum aktif atau belum diedit, JANGAN TAMPILKAN (skip)
            if (!isActive || !isReady) return; 

            // --- Logika Pencarian & Filter Kategori ---
            const matchesSearch = d.name?.toLowerCase().includes(search) || false;
            const matchesFilter = filter === 'all' || d.category === filter;

            if(matchesSearch && matchesFilter) {
                destinations.push({ id: doc.id, ...d });
            }
        });

        // --- Logika Sorting ---
        if (sortBy === 'highest_rating') {
            destinations.sort((a, b) => (b.rating || 0) - (a.rating || 0));
        } else {
            // Default: Terbaru
            destinations.reverse(); 
        }

        // Render HTML
        let html = '';
        destinations.forEach(d => {
            const imgSrc = (d.image && d.image.length > 20) ? d.image : 'https://via.placeholder.com/400?text=No+Image';

            html += `
            <div class="bg-white rounded-xl shadow-sm hover:shadow-xl transition overflow-hidden cursor-pointer group flex flex-col h-full border border-slate-100" onclick="window.viewDetail('${d.id}')">
                <div class="h-64 relative overflow-hidden bg-slate-200">
                    <img src="${imgSrc}" class="absolute inset-0 w-full h-full object-cover blur-xl scale-110 opacity-60">
                    <img src="${imgSrc}" class="relative w-full h-full object-contain z-10 transition duration-500 group-hover:scale-105" onerror="this.src='https://via.placeholder.com/400?text=Image+Error'">
                    <span class="absolute top-3 left-3 z-20 bg-white/90 px-3 py-1 rounded-full text-xs font-bold text-slate-700 shadow-sm">
                        ${d.category || 'Umum'}
                    </span>
                </div>
                <div class="p-5 flex flex-col flex-grow relative bg-white">
                    <div class="flex justify-between items-start mb-2">
                        <h3 class="text-lg font-bold text-slate-800 line-clamp-1 group-hover:text-sky-600 transition">${d.name}</h3>
                        <div class="flex items-center text-xs font-bold text-yellow-500 bg-yellow-50 px-2 py-1 rounded border border-yellow-100">
                            <i class="fa-solid fa-star mr-1"></i> ${d.rating?.toFixed(1) || 0}
                        </div>
                    </div>
                    <p class="text-slate-500 text-sm line-clamp-2 mb-4 flex-grow">${d.description || '...'}</p>
                    <div class="text-xs text-slate-400 flex items-center pt-4 border-t border-slate-50">
                        <i class="fa-solid fa-map-marker-alt mr-1 text-red-400"></i> 
                        <span class="truncate">${d.address?.substring(0,30) || 'Lokasi'}...</span>
                    </div>
                </div>
            </div>`;
        });
        
         if (destinations.length === 0) {
            list.innerHTML = `
            <div class="col-span-full flex flex-col items-center justify-center py-20 text-center">
                <div class="bg-sky-50 p-8 rounded-full mb-6 animate-bounce shadow-sm border border-sky-100">
                    <i class="fa-solid fa-plane-slash text-6xl text-sky-400"></i>
                </div>
                <h3 class="text-2xl font-bold text-slate-800 mb-3">Yah, Destinasi Tidak Ditemukan</h3>
                <p class="text-slate-500 max-w-md mx-auto mb-8 leading-relaxed">
                    Kami tidak menemukan wisata dengan kata kunci atau kategori tersebut. Coba cari kata lain atau jelajahi semua kategori.
                </p>
                <button onclick="document.getElementById('search-input').value=''; document.getElementById('filter-category').value='all'; renderDestinations();" 
                        class="px-8 py-3 bg-white border-2 border-slate-200 text-slate-600 rounded-full font-bold hover:bg-sky-50 hover:text-sky-600 hover:border-sky-200 transition shadow-sm transform hover:-translate-y-1">
                    <i class="fa-solid fa-rotate-right mr-2"></i> Reset Pencarian
                </button>
            </div>
            `;
        } else {
            list.innerHTML = html;
        }

    } catch (err) {
        console.error("Error loading home:", err);
        list.innerHTML = '<p class="text-center text-red-500">Gagal memuat data.</p>';
    }
}

document.getElementById('btn-search').addEventListener('click', renderDestinations);

// TAMBAHAN BARU: Panggil renderDestinations saat opsi sorting diubah
const sortOptionsEl = document.getElementById('sort-options');
if(sortOptionsEl) sortOptionsEl.addEventListener('change', renderDestinations);

// ... (sisanya tetap sama)

// --- DETAIL PAGE LOGIC ---
// --- DETAIL PAGE LOGIC (VERSI ANTI CRASH) ---
window.viewDetail = async (destId) => {
    currentDestId = destId;
    window.navigate('detail');
    
    try {
        const snap = await getDoc(doc(db, COLL_DESTINATIONS, destId));
        
        if(snap.exists()) {
            const d = snap.data();
            
            // Helper: Isi teks hanya jika elemennya ada (Anti Error)
            const setText = (id, val) => {
                const el = document.getElementById(id);
                if(el) el.innerText = val || '-';
            };

            // 1. Isi Data Teks
            setText('detail-title', d.name);
            setText('detail-category', d.category);
            setText('detail-address', d.address);
            setText('detail-desc', d.description);
            const contactEl = document.getElementById('detail-contact');
if (contactEl) {
    if (d.contact) {
        // Render sebagai Link Telepon
        contactEl.innerHTML = `<a href="tel:${d.contact}" class="hover:text-sky-600 hover:underline transition" title="Klik untuk menelepon">${d.contact}</a>`;
    } else {
        contactEl.innerText = '-';
    }
}
            setText('detail-avg-rating', d.rating ? d.rating.toFixed(1) : '0.0');
            setText('detail-total-reviews', (d.reviewCount || 0) + ' ulasan');

            // 2. Isi Gambar Utama (Dengan Fallback)
            const imgEl = document.getElementById('detail-img');
            if(imgEl) {
                // Cek: Apakah ada link gambar? Kalau kosong/undefined, pakai placeholder
                const imageSrc = (d.image && d.image.length > 10) ? d.image : 'https://via.placeholder.com/800x400?text=Foto+Tidak+Tersedia';
                imgEl.src = imageSrc;
            }

            // 3. Logic Maps (Link & Iframe)
            const mapLink = document.getElementById('detail-map-link');
            const mapFrame = document.getElementById('detail-map-frame');
            const mapPlaceholder = document.getElementById('map-placeholder');
            
            const hasCoords = d.lat && d.lng; // Cek apakah koordinat terisi?

            if (hasCoords) {
                const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${d.lat},${d.lng}`;
                const embedUrl = `https://maps.google.com/maps?q=${d.lat},${d.lng}&z=15&output=embed`;

                if(mapLink) mapLink.href = googleMapsUrl;
                
                if(mapFrame) {
                    mapFrame.src = embedUrl;
                    mapFrame.classList.remove('hidden');
                }
                if(mapPlaceholder) mapPlaceholder.classList.add('hidden');
            } else {
                // Jika tidak ada koordinat, sembunyikan peta
                if(mapLink) mapLink.href = '#';
                if(mapFrame) mapFrame.classList.add('hidden');
                if(mapPlaceholder) mapPlaceholder.classList.remove('hidden');
            }

            // 4. Atur Tampilan Form Review (UPDATE DISINI)
            // ---------------------------------------------------------
            const formContainer = document.getElementById('review-form-container');
            const warning = document.getElementById('login-to-review');
            
            if (formContainer && warning) {
                // LOGIKA LAMA: if(currentUser && userData.role === 'user') {
                
                // LOGIKA BARU: Izinkan User ATAU Admin
                if(currentUser && (userData.role === 'user' || userData.role === 'admin')) {
                    formContainer.classList.remove('hidden');
                    warning.classList.add('hidden');
                } else {
                    // Sembunyikan form jika belum login atau jika role-nya Manager
                    formContainer.classList.add('hidden');
                    if(!currentUser) warning.classList.remove('hidden');
                }
            }

            // 5. Load Komentar
            loadReviews(destId);
        }
    } catch (err) {
        console.error("Error di viewDetail:", err); // Cek console jika masih error
    }
};

async function loadReviews(destId) {
    const list = document.getElementById('public-reviews-list');
    
    // ... (kode loading biarkan sama) ...
    list.innerHTML = '<div class="text-center py-4"><i class="fa-solid fa-spinner fa-spin text-slate-400"></i></div>';

    const q = query(collection(db, COLL_REVIEWS), where("destId", "==", destId));
    
    try {
        const snap = await getDocs(q);
        // ... (kode pengecekan empty biarkan sama) ...
        
        // Konversi ke array biar rapi
        let reviews = [];
        snap.forEach(doc => reviews.push({ id: doc.id, ...doc.data() }));

        // Urutkan ulasan
        reviews.sort((a, b) => {
            if (currentUser && a.userId === currentUser.uid) return -1;
            return new Date(b.date) - new Date(a.date);
        });

        let html = ''; // Reset html string

        reviews.forEach(r => {
            const rid = r.id;

            // --- PERBAIKAN LOGIKA FOTO PROFIL ---
            // Cek apakah ada userPhoto di database? Jika tidak, pakai icon default/inisial
            let avatarHtml = '';
            if (r.userPhoto) {
                // Tampilkan Foto User
                avatarHtml = `<img src="${r.userPhoto}" class="w-8 h-8 rounded-full object-cover border border-slate-200 mr-3">`;
            } else {
                // Tampilkan Icon Default (Kode Lama)
                avatarHtml = `
                <div class="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-xs mr-3">
                    <i class="fa-solid fa-user"></i>
                </div>`;
            }
            // ------------------------------------
            
            // ... (logika tombol delete biarkan sama) ...
            let deleteButton = '';
            // (Copy paste logika deleteButton yang lama disini...)
             const isManager = currentUser && currentUser.uid === destId; // Pastikan variabel ini ada di scope fungsi loadReviews atau diambil dari global
             if (currentUser && (isManager || currentUser.uid === r.userId)) {
                deleteButton = `
                    <button onclick="window.deleteReview('${rid}', '${destId}', '${r.userId}')" 
                            class="text-xs text-red-500 hover:text-red-700 ml-3 transition" title="Hapus Ulasan">
                        <i class="fa-solid fa-trash-can"></i> Hapus
                    </button>`;
            }

            // ... (logika officialReplyHtml biarkan sama) ...
             let officialReplyHtml = '';
            if (r.reply) {
                officialReplyHtml = `
                <div class="mt-3 ml-8 bg-sky-50 p-3 rounded-lg border-l-4 border-sky-500">
                     <p class="text-xs font-bold text-sky-700 mb-1">
                        <i class="fa-solid fa-user-tie mr-1"></i> Respon Pengelola:
                     </p>
                     <p class="text-sm text-slate-700 italic">"${r.reply}"</p>
                </div>`;
            }

            // --- RENDER HTML (Gunakan variable avatarHtml tadi) ---
            html += `
            <div class="border-b border-slate-100 pb-6 mb-4">
                <div class="flex items-center mb-2">
                    
                    <!-- Masukkan Avatar Disini -->
                    ${avatarHtml}

                    <div>
                        <div class="font-bold text-sm text-slate-800">
                            ${r.userName} 
                            ${(currentUser && currentUser.uid === r.userId) ? '<span class="text-xs text-sky-600 font-normal">(Anda)</span>' : ''}
                        </div>
                        <div class="text-xs text-yellow-500">
                            ${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}
                        </div>
                    </div>
                    <div class="ml-auto text-xs text-slate-400 flex items-center">
                        ${new Date(r.date).toLocaleDateString()}
                        ${deleteButton} 
                    </div>
                </div>
                <p class="text-sm text-slate-600 leading-relaxed pl-11">"${r.comment}"</p>
                
                ${officialReplyHtml}
            </div>`;
        });
        
        list.innerHTML = html;
    } catch(err) {
        console.error(err);
        list.innerHTML = '<p class="text-slate-400 text-sm text-center">Gagal memuat ulasan.</p>';
    }
}

// --- FUNGSI BALAS DARI HALAMAN PUBLIK ---
window.handleReplyPublic = async (reviewId, destId) => {
    const input = document.getElementById(`reply-input-${reviewId}`);
    const replyText = input.value.trim();
    
    if(!replyText) return alert("Balasan tidak boleh kosong!");
    
    const btn = event.target; // Ambil tombol yang diklik
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    btn.disabled = true;

    try {
        await updateDoc(doc(db, COLL_REVIEWS, reviewId), {
            reply: replyText,
            replyDate: new Date().toISOString()
        });
        
        showToast("Balasan berhasil dikirim!");
        // Reload ulasan agar tampilan terupdate
        loadReviews(destId); 
    } catch(err) {
        console.error(err);
        alert("Gagal membalas: " + err.message);
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
};

document.getElementById('form-review').addEventListener('submit', async (e) => {
    e.preventDefault();
    if(!currentUser) return;
    
    const rating = parseInt(document.getElementById('review-rating').value);
    const comment = document.getElementById('review-text').value;

    try {
        await addDoc(collection(db, COLL_REVIEWS), {
            destId: currentDestId,
            userId: currentUser.uid,
            userName: userData.name,
            userPhoto: userData.photoURL || null,
            rating, comment, date: new Date().toISOString()
        });

        // Update Destinasi Rating (Simple Logic)
        const q = query(collection(db, COLL_REVIEWS), where("destId", "==", currentDestId));
        const snap = await getDocs(q);
        let total = 0;
        snap.forEach(d => total += d.data().rating);
        
        await updateDoc(doc(db, COLL_DESTINATIONS, currentDestId), {
            rating: total / snap.size,
            reviewCount: snap.size
        });

        document.getElementById('review-text').value = '';
        showToast('Ulasan terkirim');
        window.viewDetail(currentDestId);
    } catch(err) { showToast('Gagal: ' + err.message, 'error'); }
});

// --- ADMIN LOGIC ---
// --- FUNGSI MODAL ADMIN (WAJIB ADA AGAR TOMBOL MATA BERFUNGSI) ---
window.closeAdminModal = () => {
    document.getElementById('modal-admin-detail').classList.add('hidden');
};

// --- UPDATE NOMOR 4: DETAIL GENERIC (USER & MANAGER) ---
// --- ADMIN: DETAIL POPUP (DINAMIS: BEDA TAMPILAN USER VS MANAGER) ---
// --- ADMIN: DETAIL POPUP (DENGAN FOTO UTUH & BACKGROUND BLUR) ---
// --- ADMIN: DETAIL POPUP (REVISI: HANDLE AKUN TERHAPUS) ---
// --- ADMIN: DETAIL POPUP (YANG DIPERCANTIK) ---
window.viewAdminDetailUser = async (uid, role) => {
    const modal = document.getElementById('modal-admin-detail');
    const modalBody = modal.querySelector('.p-6');
    
    modal.classList.remove('hidden');
    modalBody.innerHTML = '<div class="flex justify-center py-10"><i class="fa-solid fa-spinner fa-spin text-3xl text-slate-400"></i></div>';

    try {
        // 1. Ambil Data User (Cek Status)
        const userSnap = await getDoc(doc(db, COLL_USERS, uid));
        let u = null;
        let isDeleted = false;

        if (userSnap.exists()) {
            u = userSnap.data();
        } else {
            isDeleted = true;
            u = {
                name: "Pengelola Dihapus",
                email: "-",
                photoURL: null,
                role: role || 'manager',
                status: 'deleted',
                createdAt: null
            };
        }

        // Siapkan variabel tampilan user
        const userAvatar = u.photoURL || `https://ui-avatars.com/api/?name=X&background=fee2e2&color=ef4444`;
        
        let statusBadge = '';
        if (isDeleted) {
            statusBadge = '<span class="px-3 py-1 rounded-full text-xs font-bold bg-red-600 text-white uppercase shadow-sm"><i class="fa-solid fa-user-slash mr-1"></i> AKUN DIHAPUS</span>';
        } else {
            const statusColor = u.status === 'active' ? 'bg-green-100 text-green-700' : (u.status === 'pending' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700');
            statusBadge = `<span class="px-3 py-1 rounded-full text-xs font-bold uppercase ${statusColor}">${u.status}</span>`;
        }

        // 2. Ambil Data Destinasi (Fokus Utama)
        let destHtml = '';
        if (role === 'manager' || isDeleted) { 
            const destSnap = await getDoc(doc(db, COLL_DESTINATIONS, uid));
            
            if (destSnap.exists()) {
                const d = destSnap.data();
                const destImg = (d.image && d.image.length > 20) ? d.image : 'https://via.placeholder.com/400x200?text=No+Image';
                const mapUrl = (d.lat && d.lng) ? `https://maps.google.com/maps?q=${d.lat},${d.lng}&z=15&output=embed` : '';

                // Badge Status Wisata
                let destStatusBadge = '';
                if(d.status === 'active') destStatusBadge = '<span class="bg-green-500 text-white text-[10px] px-2 py-0.5 rounded font-bold uppercase shadow-sm">Tayang</span>';
                else if(d.status === 'pending') destStatusBadge = '<span class="bg-yellow-500 text-white text-[10px] px-2 py-0.5 rounded font-bold uppercase shadow-sm">Pending</span>';
                else destStatusBadge = '<span class="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded font-bold uppercase shadow-sm">Blocked</span>';

                destHtml = `
                <div class="mt-6 border-t border-slate-200 pt-6">
                    <h4 class="text-sm font-bold text-slate-700 uppercase mb-4 flex items-center">
                        <i class="fa-solid fa-map-location-dot mr-2 text-indigo-500"></i> Detail Wisata yang Dikelola
                    </h4>

                    <div class="bg-white rounded-xl overflow-hidden border border-slate-200 shadow-sm">
                        <!-- Hero Image Wisata -->
                        <div class="relative h-48 bg-slate-800 group overflow-hidden">
                            <img src="${destImg}" class="absolute inset-0 w-full h-full object-cover opacity-60 blur-sm scale-110">
                            <img src="${destImg}" class="relative w-full h-full object-contain p-2 z-10 transition-transform duration-500 group-hover:scale-105">
                            <div class="absolute top-3 right-3 z-20">
                                ${destStatusBadge}
                            </div>
                            <div class="absolute bottom-0 left-0 w-full bg-gradient-to-t from-black/80 to-transparent p-4 z-20">
                                <span class="text-[10px] bg-indigo-600 text-white px-2 py-0.5 rounded uppercase font-bold mb-1 inline-block shadow-sm border border-white/20">${d.category || 'Umum'}</span>
                                <h3 class="text-xl font-bold text-white leading-tight drop-shadow-md">${d.name || 'Nama Belum Diatur'}</h3>
                            </div>
                        </div>

                        <!-- Info Wisata -->
                        <div class="p-5 space-y-4">
                            <!-- Stats -->
                            <div class="flex items-center gap-4 text-sm border-b border-slate-100 pb-4">
                                <div class="flex items-center text-yellow-600 font-bold bg-yellow-50 px-2 py-1 rounded border border-yellow-100">
                                    <i class="fa-solid fa-star mr-1"></i> ${d.rating?.toFixed(1) || 0}
                                </div>
                                <div class="text-slate-500 text-xs font-medium">
                                    <i class="fa-solid fa-comment mr-1"></i> ${d.reviewCount || 0} Ulasan
                                </div>
                                <div class="text-slate-500 ml-auto text-xs">
                                    Status Data: ${d.isSetup ? '<span class="text-green-600 font-bold"><i class="fa-solid fa-check-circle mr-1"></i>Lengkap</span>' : '<span class="text-red-500 font-bold"><i class="fa-solid fa-circle-xmark mr-1"></i>Belum Setup</span>'}
                                </div>
                            </div>

                            <!-- Deskripsi -->
                            <div>
                                <p class="text-[10px] font-bold text-slate-400 uppercase mb-1 tracking-wider">Deskripsi</p>
                                <div class="text-sm text-slate-600 italic bg-slate-50 p-3 rounded-lg border border-slate-100 relative">
                                    <i class="fa-solid fa-quote-left absolute top-2 left-2 text-slate-200 text-xl"></i>
                                    <p class="relative z-10 pl-4 line-clamp-3 leading-relaxed">"${d.description || 'Tidak ada deskripsi.'}"</p>
                                </div>
                            </div>

                            <!-- Lokasi & Kontak -->
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <p class="text-[10px] font-bold text-slate-400 uppercase mb-1 tracking-wider">Lokasi</p>
                                    <p class="text-sm text-slate-700 flex items-start gap-2 mb-2">
                                        <i class="fa-solid fa-location-dot mt-1 text-red-400"></i>
                                        <span class="line-clamp-2">${d.address || '-'}</span>
                                    </p>
                                    ${mapUrl ? `<div class="h-24 rounded-lg overflow-hidden border border-slate-200 shadow-sm"><iframe src="${mapUrl}" width="100%" height="100%" style="border:0;" loading="lazy"></iframe></div>` : '<div class="h-24 bg-slate-100 rounded-lg flex items-center justify-center text-xs text-slate-400 border border-dashed border-slate-300">Peta tidak tersedia</div>'}
                                </div>
                                <div>
                                    <p class="text-[10px] font-bold text-slate-400 uppercase mb-1 tracking-wider">Kontak Pengelola</p>
                                    <div class="text-sm text-slate-700 bg-indigo-50/50 p-3 rounded-lg border border-indigo-100">
                                        <p class="mb-2 flex items-center gap-2">
                                            <span class="w-6 h-6 rounded-full bg-white flex items-center justify-center text-indigo-500 shadow-sm"><i class="fa-solid fa-phone text-xs"></i></span> 
                                            ${d.contact ? `<span class="font-medium">${d.contact}</span>` : '<span class="text-red-500 italic font-bold text-xs bg-white px-2 py-0.5 rounded border border-red-100">Tidak ada (User Dihapus)</span>'}
                                        </p>
                                        <p class="flex items-center gap-2">
                                            <span class="w-6 h-6 rounded-full bg-white flex items-center justify-center text-indigo-500 shadow-sm"><i class="fa-solid fa-user text-xs"></i></span> 
                                            <span class="truncate">${u.name}</span>
                                        </p>
                                    </div>
                                    ${isDeleted ? `<div class="mt-2 text-[10px] text-red-600 bg-red-50 p-2 rounded border border-red-100 flex items-start gap-2">
                                        <i class="fa-solid fa-triangle-exclamation mt-0.5"></i> 
                                        <span><b>Perhatian:</b> Akun pengelola asli sudah dihapus. Wisata ini berjalan tanpa pemilik akun (Yatim Piatu).</span>
                                    </div>` : ''}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                `;
            } else {
                 destHtml = `<div class="mt-6 p-6 bg-slate-50 rounded-xl text-center text-slate-400 italic text-sm border border-dashed border-slate-200">
                    <i class="fa-solid fa-folder-open text-2xl mb-2 opacity-50"></i><br>
                    Belum ada data wisata yang dibuat.
                 </div>`;
            }
        }

        // --- RENDER MODAL UTAMA ---
        modalBody.innerHTML = `
            <div>
                <!-- Header Profil -->
                <div class="flex items-center gap-5 mb-6 bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <div class="relative shrink-0">
                        <img src="${userAvatar}" class="w-16 h-16 rounded-full object-cover border-4 ${isDeleted ? 'border-red-100 grayscale' : 'border-white shadow-md'}">
                        ${isDeleted ? '<div class="absolute -bottom-1 -right-1 bg-red-500 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs border-2 border-white shadow-sm"><i class="fa-solid fa-xmark"></i></div>' : ''}
                    </div>
                    <div class="flex-grow">
                        <h3 class="text-xl font-bold ${isDeleted ? 'text-slate-400 line-through decoration-2 decoration-red-300' : 'text-slate-800'}">${u.name}</h3>
                        <p class="text-sm text-slate-500 font-mono flex items-center gap-2">
                            <i class="fa-solid fa-envelope opacity-50"></i> ${u.email}
                        </p>
                        <div class="mt-2 flex flex-wrap gap-2 items-center">
                            ${statusBadge}
                            <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-white text-slate-500 border border-slate-200 uppercase font-mono tracking-tight shadow-sm">ID: ${uid.substring(0,8)}...</span>
                        </div>
                    </div>
                </div>

                <!-- Konten Wisata -->
                ${destHtml}
            </div>
        `;

    } catch (err) {
        console.error(err);
        modalBody.innerHTML = `<p class="text-red-500 text-center bg-red-50 p-4 rounded-lg border border-red-100">Gagal memuat detail: ${err.message}</p>`;
    }
};

// --- ADMIN TAB & FILTER LOGIC ---
const tabAdmUsers = document.getElementById('admin-tab-users');
const tabAdmDest = document.getElementById('admin-tab-destinations');
const viewAdmUsers = document.getElementById('admin-view-users');
const viewAdmDest = document.getElementById('admin-view-destinations');
const filterRole = document.getElementById('admin-filter-role');
const filterCat = document.getElementById('admin-filter-category');

// Klik Tab Users
tabAdmUsers.addEventListener('click', () => {
    // Style Tab Active
    tabAdmUsers.classList.add('bg-white', 'text-slate-800', 'shadow-sm');
    tabAdmUsers.classList.remove('text-slate-500');
    tabAdmDest.classList.remove('bg-white', 'text-slate-800', 'shadow-sm');
    tabAdmDest.classList.add('text-slate-500');
    
    // Toggle View
    viewAdmUsers.classList.remove('hidden');
    viewAdmDest.classList.add('hidden');
    
    // Toggle Filter
    filterRole.classList.remove('hidden');
    filterCat.classList.add('hidden');

    renderAdminUsers(); // Refresh data user
});

// Klik Tab Destinasi
tabAdmDest.addEventListener('click', () => {
    // Style Tab Active
    tabAdmDest.classList.add('bg-white', 'text-slate-800', 'shadow-sm');
    tabAdmDest.classList.remove('text-slate-500');
    tabAdmUsers.classList.remove('bg-white', 'text-slate-800', 'shadow-sm');
    tabAdmUsers.classList.add('text-slate-500');
    
    // Toggle View
    viewAdmDest.classList.remove('hidden');
    viewAdmUsers.classList.add('hidden');
    
    // Toggle Filter
    filterRole.classList.add('hidden');
    filterCat.classList.remove('hidden');

    renderAdminDestinations(); // Refresh data wisata
});

// Listener Filter Kategori (Spesifik Tab Destinasi)
filterCat.addEventListener('change', renderAdminDestinations);

// Update Search Listener agar pintar (Cek Tab Aktif)
document.getElementById('admin-search-input').addEventListener('input', () => {
    if (!viewAdmUsers.classList.contains('hidden')) {
        renderAdminUsers();
    } else {
        renderAdminDestinations();
    }
});

// --- RENDER TABEL WISATA (FULL COLUMN + SCROLL, DENGAN JARAK AMAN) ---
// ... (Kode fungsi lainnya tetap sama, TIMPA fungsi renderAdminDestinations dengan yang ini) ...

async function renderAdminDestinations() {
    const tbody = document.getElementById('admin-dest-list');
    const searchInput = document.getElementById('admin-search-input').value.toLowerCase();
    const filterCategory = document.getElementById('admin-filter-category').value;
    
    tbody.innerHTML = '<tr><td colspan="5" class="p-8 text-center"><i class="fa-solid fa-spinner fa-spin text-emerald-500 text-xl"></i></td></tr>';
    
    try {
        // Ambil data terbaru
        const snapDest = await getDocs(collection(db, COLL_DESTINATIONS));
        const snapUsers = await getDocs(collection(db, COLL_USERS));
        
        // Buat Map User: ID -> Nama
        const userMap = {}; 
        snapUsers.forEach(u => { 
            const d = u.data(); 
            userMap[u.id] = d.name; 
        });

        let html = ''; 
        let found = false;

        snapDest.forEach(doc => {
            const d = doc.data(); 
            const destId = doc.id;
            
            // 1. Cek Nama Pengelola (Handle jika user sudah dihapus)
            // Jika ID tidak ditemukan di userMap, tampilkan 'Tanpa Pengelola'
            const managerNameRaw = userMap[d.managerId];
            const managerName = managerNameRaw || '<span class="text-slate-400 italic font-normal">Tanpa Pengelola</span>';
            const managerIdDisplay = managerNameRaw ? d.managerId.substring(0,6)+'...' : '-';
            
            // Filter Pencarian (Gunakan nama raw agar tag HTML tidak ikut dicari)
            const searchTarget = (d.name || '') + ' ' + (managerNameRaw || 'Tanpa Pengelola');

            if (searchInput && !searchTarget.toLowerCase().includes(searchInput)) return;
            if (filterCategory !== 'all' && d.category !== filterCategory) return;
            
            found = true;
            const imgSrc = (d.image && d.image.length > 20) ? d.image : 'https://via.placeholder.com/150?text=No+Img';
            
            // 2. LOGIKA STATUS (DIPERBAIKI)
            // Cek langsung ke d.status (Data Wisata), JANGAN cek ke userStatusMap
            let statusBadge = '';
            if (d.status === 'active') {
                statusBadge = '<span class="inline-flex items-center text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold uppercase border border-green-200"><span class="inline-block w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5"></span> Tayang</span>';
            } else if (d.status === 'pending') {
                statusBadge = '<span class="inline-flex items-center text-[10px] bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-bold uppercase border border-yellow-200"><span class="inline-block w-1.5 h-1.5 rounded-full bg-yellow-500 mr-1.5"></span> Pending</span>';
            } else if (d.status === 'blocked') {
                statusBadge = '<span class="inline-flex items-center text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold uppercase border border-red-200"><span class="inline-block w-1.5 h-1.5 rounded-full bg-red-500 mr-1.5"></span> Diblokir</span>';
            } else {
                statusBadge = '<span class="inline-flex items-center text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-bold uppercase border border-slate-200">Non-Aktif</span>';
            }

            html += `
            <tr class="hover:bg-emerald-50/30 transition duration-150 ease-in-out group border-b border-slate-100">
                
                <!-- KOLOM 1: INFO DESTINASI -->
                <td class="px-6 py-4">
                    <div class="flex items-start gap-4">
                        <img src="${imgSrc}" class="w-14 h-14 rounded-lg object-cover border border-slate-200 shadow-sm bg-white shrink-0">
                        <div class="pt-0.5">
                            <div class="font-bold text-slate-800 text-sm mb-1 line-clamp-1">${d.name || 'Tanpa Nama'}</div>
                            <div class="flex items-center gap-3 text-xs text-slate-500">
                                ${statusBadge}
                            </div>
                        </div>
                    </div>
                </td>
                
                <!-- KOLOM 2: KATEGORI -->
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="inline-flex items-center px-3 py-1 rounded text-xs font-medium bg-white border border-slate-200 text-slate-700 shadow-sm">
                        ${d.category || '-'}
                    </span>
                </td>

                <!-- KOLOM 3: PENGELOLA -->
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="text-sm font-bold text-indigo-600 hover:underline cursor-pointer" onclick="window.viewAdminDetailUser('${d.managerId}', 'manager')">
                        ${managerName}
                    </div>
                    <div class="text-[10px] text-slate-400 font-mono mt-0.5">ID: ${managerIdDisplay}</div>
                </td>

                <!-- KOLOM 4: RATING -->
                <td class="px-6 py-4 whitespace-nowrap text-center">
                    <div class="inline-flex items-center bg-yellow-50 text-yellow-700 px-2 py-1 rounded border border-yellow-200 shadow-sm">
                        <span class="font-bold text-sm mr-1">${d.rating?.toFixed(1) || 0}</span> 
                        <i class="fa-solid fa-star text-[10px]"></i>
                    </div>
                    <div class="text-[10px] text-slate-400 mt-1 font-medium">${d.reviewCount || 0} ulasan</div>
                </td>
                
                <!-- KOLOM 5: AKSI -->
                <td class="px-6 py-4 whitespace-nowrap text-right">
                    <div class="flex items-center justify-end gap-2">
                        <button onclick="window.viewAdminDetailUser('${d.managerId}', 'manager')" class="p-2 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition shadow-sm" title="Detail">
                            <i class="fa-solid fa-eye"></i>
                        </button>
                        <button onclick="window.adminDeleteDestination('${destId}')" class="p-2 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition shadow-sm" title="Hapus Wisata">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>`;
        });
        
        tbody.innerHTML = found ? html : '<tr><td colspan="5" class="p-10 text-center text-slate-400 bg-slate-50 m-4 rounded-lg border border-dashed border-slate-200">Tidak ada data wisata.</td></tr>';
        
    } catch (err) { 
        console.error(err);
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-red-500 p-4">Gagal memuat data.</td></tr>'; 
    }
}

// --- FUNGSI ADMIN: HAPUS DESTINASI (RESET DATA WISATA) ---
window.adminDeleteDestination = async (destId) => {
    if (!confirm("PERINGATAN: Apakah Anda yakin ingin menghapus data wisata ini?\n\n- Akun Pengelola TIDAK akan terhapus.\n- Semua Ulasan pengunjung akan terhapus.\n- Data akan hilang permanen.")) return;

    document.body.style.cursor = 'wait';

    try {
        // 1. Hapus Dokumen Destinasi
        await deleteDoc(doc(db, COLL_DESTINATIONS, destId));

        // 2. Hapus Semua Ulasan Terkait
        const qReviews = query(collection(db, COLL_REVIEWS), where("destId", "==", destId));
        const snapReviews = await getDocs(qReviews);
        const deletePromises = snapReviews.docs.map(d => deleteDoc(doc(db, COLL_REVIEWS, d.id)));
        await Promise.all(deletePromises);

        showToast("Data Wisata berhasil dihapus (Reset).");
        
        // Refresh Tabel Destinasi & Update Stats
        renderAdminDestinations();
        // Update juga stats count di atas (karena jumlah wisata berkurang)
        renderAdminUsers(); 

    } catch (err) {
        console.error(err);
        alert("Gagal menghapus wisata: " + err.message);
    } finally {
        document.body.style.cursor = 'default';
    }
};

// --- RENDER TABEL USER (DENGAN SORTING PENDING DI ATAS) ---
async function renderAdminUsers() {
    const tbody = document.getElementById('admin-users-list');
    const filterRole = document.getElementById('admin-filter-role').value;
    const searchInput = document.getElementById('admin-search-input').value.toLowerCase();
    
    tbody.innerHTML = '<tr><td colspan="5" class="p-8 text-center"><i class="fa-solid fa-spinner fa-spin text-slate-400 text-xl"></i></td></tr>';
    
    try {
        const snap = await getDocs(collection(db, COLL_USERS));
        const snapDest = await getDocs(collection(db, COLL_DESTINATIONS)); // Untuk stats
        
        let stats = { user:0, manager:0, pending:0 }; 
        let usersList = []; // Array penampung data untuk disortir

        // 1. KUMPULKAN DATA & HITUNG STATS
        snap.forEach(d => {
            const u = d.data();
            
            // Jangan tampilkan akun Admin sendiri
            if (u.role === 'admin') return;
            
            // Hitung Statistik
            if(u.role === 'user') stats.user++; 
            if(u.role === 'manager') stats.manager++; 
            if(u.status === 'pending') stats.pending++;

            // Masukkan ke array usersList
            usersList.push({ id: d.id, ...u });
        });

        // 2. LOGIKA SORTING (KUNCI PERUBAHAN ADA DISINI)
        usersList.sort((a, b) => {
            // Jika 'a' pending dan 'b' bukan pending, 'a' naik ke atas (-1)
            if (a.status === 'pending' && b.status !== 'pending') return -1;
            
            // Jika 'b' pending dan 'a' bukan pending, 'b' naik ke atas (1)
            if (b.status === 'pending' && a.status !== 'pending') return 1;
            
            // Jika status sama, urutkan berdasarkan Tanggal Daftar (Terbaru di atas)
            // Asumsi ada field createdAt, jika tidak ada, hiraukan
            const dateA = a.createdAt ? new Date(a.createdAt) : 0;
            const dateB = b.createdAt ? new Date(b.createdAt) : 0;
            return dateB - dateA; 
        });

        // 3. RENDER HTML DARI ARRAY YANG SUDAH DIURUTKAN
        let html = ''; 
        let found = false;

        usersList.forEach(u => {
            // Filter Search & Role (Logic tetap sama)
            if(filterRole !== 'all' && u.role !== filterRole) return;
            if (searchInput && !u.name.toLowerCase().includes(searchInput) && !u.email.toLowerCase().includes(searchInput)) return;
            
            found = true;
            const isPending = u.status === 'pending';
            
            // Logika Foto Profil
            const userImg = u.photoURL; 
            const avatarHtml = userImg
                ? `<img src="${userImg}" alt="${u.name}" class="h-10 w-10 rounded-full object-cover border border-slate-200 shadow-sm mr-3 shrink-0 bg-white">`
                : `<div class="h-10 w-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 font-bold text-sm mr-3 shrink-0 border border-slate-300">${u.name.charAt(0).toUpperCase()}</div>`;

            const roleBadge = u.role === 'manager' 
                ? '<span class="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-md text-xs font-semibold border border-indigo-100"><i class="fa-solid fa-user-tie text-[10px]"></i> Pengelola</span>'
                : '<span class="inline-flex items-center gap-1 bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded-md text-xs font-semibold border border-slate-200"><i class="fa-solid fa-user text-[10px]"></i> User</span>';

            let statusClass = 'bg-slate-100 text-slate-500 border-slate-200';
            let statusIcon = 'fa-minus';
            
            if(isPending) { statusClass = 'bg-yellow-100 text-yellow-700 border-yellow-200 animate-pulse'; statusIcon = 'fa-clock'; }
            else if(u.status === 'active') { statusClass = 'bg-green-50 text-green-700 border-green-200'; statusIcon = 'fa-check'; }
            else if(u.status === 'blocked') { statusClass = 'bg-red-50 text-red-700 border-red-200'; statusIcon = 'fa-ban'; }

            html += `
            <tr class="hover:bg-slate-50 transition duration-150 ease-in-out group border-b border-slate-100 ${isPending ? 'bg-yellow-50/30' : ''}">
                <td class="px-6 py-4">
                    <div class="flex items-center">
                        ${avatarHtml}
                        <div>
                            <div class="font-bold text-slate-800 text-sm">${u.name}</div>
                            <div class="text-xs text-slate-500 font-mono">${u.email}</div>
                        </div>
                    </div>
                </td>

                <td class="px-6 py-4 whitespace-nowrap">${roleBadge}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm">
                    ${u.managerInfo?.destName ? `<div class="font-medium text-slate-700 flex items-center gap-1.5"><i class="fa-solid fa-map-pin text-indigo-500"></i> ${u.managerInfo.destName}</div>` : '<span class="text-slate-400 text-xs italic">-</span>'}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-center">
                    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${statusClass} capitalize">
                        <i class="fa-solid ${statusIcon} text-[10px]"></i> ${u.status}
                    </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-right">
                    <div class="flex items-center justify-end gap-2">
                        <button onclick="window.viewAdminDetailUser('${u.id}', '${u.role}')" class="p-2 rounded-lg bg-sky-50 text-sky-600 hover:bg-sky-100 transition shadow-sm" title="Detail"><i class="fa-solid fa-eye"></i></button>
                        ${isPending ? `<button onclick="window.updateUserStatus('${u.id}', 'active')" class="p-2 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 transition shadow-sm font-bold border border-green-200" title="Setujui (Approve)">Setujui <i class="fa-solid fa-check ml-1"></i></button>` : ''}
                        ${u.status === 'active' ? `<button onclick="window.updateUserStatus('${u.id}', 'blocked')" class="p-2 rounded-lg bg-orange-50 text-orange-500 hover:bg-orange-100 transition shadow-sm" title="Blokir"><i class="fa-solid fa-ban"></i></button>` : ''}
                        ${u.status === 'blocked' ? `<button onclick="window.updateUserStatus('${u.id}', 'active')" class="p-2 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 transition shadow-sm" title="Buka Blokir"><i class="fa-solid fa-lock-open"></i></button>` : ''}
                        <button onclick="window.deleteUser('${u.id}')" class="p-2 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition shadow-sm" title="Hapus"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </td>
            </tr>`;
        });

        tbody.innerHTML = found ? html : '<tr><td colspan="5" class="p-10 text-center text-slate-400 bg-slate-50 m-4 rounded-lg border border-dashed border-slate-200">Tidak ada data ditemukan.</td></tr>';
        
        // Update Kartu Statistik di Dashboard Admin
        document.getElementById('stat-users-count').innerText = stats.user;
        document.getElementById('stat-managers-count').innerText = stats.manager;
        document.getElementById('stat-pending-count').innerText = stats.pending;
        document.getElementById('stat-dest-count').innerText = snapDest.size;

    } catch(err) { 
        console.error(err);
        tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-red-500">Gagal memuat data.</td></tr>'; 
    }
}

// ... (Kode selanjutnya renderAdminDestinations dll tetap sama) ...

document.getElementById('admin-filter-role').addEventListener('change', renderAdminUsers);
// Tambahkan ini di bawah listener 'admin-filter-role'
document.getElementById('admin-search-input').addEventListener('input', renderAdminUsers);

window.updateUserStatus = async (uid, status) => {
    // Terjemahkan status untuk konfirmasi agar admin paham
    const action = status === 'active' ? 'MENYETUJUI' : 'MEMBLOKIR';
    
    if(confirm(`Yakin ingin ${action} akun ini?`)) {
        try {
            // 1. Update status di data User (Profil)
            await updateDoc(doc(db, COLL_USERS, uid), { status: status });
            
            // 2. Update status di data Destinasi (Wisata) juga!
            // Kita pakai try-catch di sini jaga-jaga kalau user bukan manager (tidak punya doc destinasi)
            try {
                const destRef = doc(db, COLL_DESTINATIONS, uid);
                // Cek dulu apakah dokumen ada biar tidak error
                const destSnap = await getDoc(destRef);
                
                if (destSnap.exists()) {
                    await updateDoc(destRef, { status: status });
                }
            } catch (errDest) {
                console.log("User ini bukan manager atau belum punya destinasi, skip update destinasi.");
            }

            showToast(`Status berhasil diubah menjadi: ${status}`);
            renderAdminUsers(); // Refresh tabel admin
            
        } catch (err) {
            console.error(err);
            showToast("Gagal update status: " + err.message, 'error');
        }
    }
};
// --- ADMIN: HAPUS USER (REVISI: BERSIH TOTAL BESERTA WISATA) ---
// --- ADMIN: HAPUS USER (REVISI FINAL: WISATA TETAP TAYANG) ---
window.deleteUser = async (uid) => {
    if(!confirm("PERINGATAN: Menghapus User akan:\n1. Menghapus akses login & profil Manager.\n2. Menghapus semua ulasan yang ditulis orang ini.\n3. NAMUN WISATA TETAP TAYANG (Tanpa kontak).\n\nLanjutkan?")) return;
    
    document.body.style.cursor = 'wait';

    try {
        // 1. Hapus User Profil (Supaya gak bisa login/daftar)
        await deleteDoc(doc(db, COLL_USERS, uid));
        
        // 2. [PERBAIKAN DISINI] JANGAN HAPUS WISATA, TAPI UPDATE SAJA
        const destRef = doc(db, COLL_DESTINATIONS, uid);
        const destSnap = await getDoc(destRef);

        if (destSnap.exists()) {
            // Kita kosongkan kontak dan beri tanda
            await updateDoc(destRef, {
                contact: "", // Hapus nomor HP
                managerName: "Tanpa Pengelola", // Opsional: Penanda
                // Status TETAP 'active' agar tetap tayang di home
            });
        }
        
        // 3. Hapus Semua Ulasan yang ditulis oleh User ini (di tempat lain)
        const qReviews = query(collection(db, COLL_REVIEWS), where("userId", "==", uid));
        const snapReviews = await getDocs(qReviews);
        const deletePromises = snapReviews.docs.map(d => deleteDoc(doc(db, COLL_REVIEWS, d.id)));
        await Promise.all(deletePromises);

        showToast("Akun Pengelola dihapus. Wisata tetap tayang tanpa kontak.");
        
        // 4. Refresh Tabel Admin
        renderAdminUsers(); 
        
        // 5. Refresh Tabel Destinasi (jika sedang terbuka)
        const viewAdmDest = document.getElementById('admin-view-destinations');
        if (viewAdmDest && !viewAdmDest.classList.contains('hidden')) {
            renderAdminDestinations();
        }

    } catch(err) {
        console.error(err);
        alert("Terjadi kesalahan: " + err.message);
    } finally {
        document.body.style.cursor = 'default';
    }
};

// --- USER PROFILE LOGIC ---

// 1. Preview Gambar saat upload di Profil
const profileFileInput = document.getElementById('profile-file-input');
if(profileFileInput) {
    profileFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => document.getElementById('profile-img-preview').src = e.target.result;
            reader.readAsDataURL(file);
        }
    });
}

// 2. Load Data Profil
// 2. Load Data Profil
async function loadUserProfile() {
    if (!currentUser) return window.navigate('login');

    // Ambil data terbaru dari DB
    const snap = await getDoc(doc(db, COLL_USERS, currentUser.uid));
    if (snap.exists()) {
        const u = snap.data();
        userData = u; 

        // Isi Form Input
        document.getElementById('profile-name').value = u.name;
        document.getElementById('profile-email').value = u.email;
        
        // --- BAGIAN YANG DIPERBAIKI (LOGIKA DISPLAY ROLE) ---
        // Isi Tampilan Kartu (Kiri)
        document.getElementById('profile-name-display').innerText = u.name;

        // Tentukan Label dan Warna berdasarkan Role
        let roleLabel = 'Pengguna Umum';
        let roleColor = 'bg-sky-100 text-sky-600'; // Default: Biru (User)

        if (u.role === 'manager') {
            roleLabel = 'Pengelola Wisata';
            roleColor = 'bg-indigo-100 text-indigo-600'; // Indigo (Manager)
        } else if (u.role === 'admin') {
            roleLabel = 'Administrator';
            roleColor = 'bg-purple-100 text-purple-600'; // Ungu (Admin)
        }

        // Terapkan ke Elemen HTML
        const roleEl = document.getElementById('profile-role-display');
        roleEl.innerText = roleLabel;
        // Kita reset class-nya lalu tambahkan warna yang sesuai
        roleEl.className = `text-xs font-bold px-3 py-1 rounded-full mt-2 inline-block capitalize ${roleColor}`;
        
        // ----------------------------------------------------

        document.getElementById('profile-status-display').innerText = u.status || 'Active';
        
        // Format Tanggal Join
        const date = u.createdAt ? new Date(u.createdAt).toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' }) : '-';
        document.getElementById('profile-join-date').innerText = date;

        // Foto Profil 
        const defaultAvatar = `https://ui-avatars.com/api/?name=${u.name}&background=random`;
        document.getElementById('profile-img-preview').src = u.photoURL || defaultAvatar;

        // Tampilkan pesan khusus HANYA JIKA manager (Admin tidak perlu lihat ini)
        const mgrInfo = document.getElementById('manager-info-only');
        if (u.role === 'manager') mgrInfo.classList.remove('hidden');
        else mgrInfo.classList.add('hidden');
    }
}

// 3. Simpan Perubahan Profil
document.getElementById('form-update-profile').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan...';
    btn.disabled = true;

    try {
        const newName = document.getElementById('profile-name').value.trim();
        const fileInput = document.getElementById('profile-file-input');
        
        if(!newName) throw new Error("Nama tidak boleh kosong.");

        let updateData = { name: newName };

        // Jika ada upload foto baru
        if (fileInput.files.length > 0) {
            const file = fileInput.files[0];
            if(file.size > 500 * 1024) throw new Error("Ukuran foto maksimal 500KB");
            
            // Convert ke Base64 (Fungsi convertToBase64 sudah ada di kode sebelumnya)
            const base64 = await convertToBase64(file);
            updateData.photoURL = base64;
        }

        // Update ke Firestore
        await updateDoc(doc(db, COLL_USERS, currentUser.uid), updateData);
        
        // Update UI Nama di Navbar langsung
        document.getElementById('nav-username').innerText = newName;
        
        // Refresh halaman profil
        await loadUserProfile();
        
        showToast("Profil berhasil diperbarui!");

    } catch (err) {
        console.error(err);
        showToast(err.message, 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
});

// --- MANAGER LOGIC ---
// 1. Event Listener untuk Preview Foto Instan (Saat pilih file dari komputer)
// --- MANAGER LOGIC ---

// 1. PREVIEW INSTAN: Saat pilih file dari folder laptop/HP
// --- FUNGSI BARU: HAPUS BALASAN ---
window.deleteReply = async (reviewId, destId) => {
    if(!confirm("Yakin ingin MENGHAPUS balasan Anda? Ulasan pengunjung tidak akan terhapus.")) return;
    
    try {
        // Gunakan deleteField() untuk menghapus field tertentu
        await updateDoc(doc(db, COLL_REVIEWS, reviewId), {
            reply: deleteField(),
            replyDate: deleteField()
        });
        
        showToast("Balasan telah dihapus.");
        
        // Refresh List
        loadManagerReviews(destId); 
    } catch(err) {
        console.error("Error delete reply:", err);
        alert("Gagal menghapus balasan: " + err.message);
    }
};

// --- FUNGSI BARU: HAPUS ULASAN SECARA TOTAL ---
// --- UPDATE: FUNGSI HAPUS ULASAN (BISA REFRESH DASHBOARD MANAGER & HALAMAN PUBLIK) ---
// --- UPDATE: FUNGSI HAPUS ULASAN (DENGAN REFRESH) ---
window.deleteReview = async (reviewId, destId, authorId) => {
    if (!currentUser) return;
    
    const isManager = currentUser.uid === destId;
    const isAuthor = currentUser.uid === authorId;
    if (!isManager && !isAuthor) return alert("Anda tidak memiliki izin.");

    if(!confirm("Yakin ingin menghapus ulasan ini?")) return;
    
    document.body.style.cursor = 'wait'; // Ubah kursor jadi loading

    try {
        // 1. Hapus dari Database
        await deleteDoc(doc(db, COLL_REVIEWS, reviewId));
        
        // 2. Hitung Ulang Rating
        const q = query(collection(db, COLL_REVIEWS), where("destId", "==", destId));
        const snap = await getDocs(q);
        let total = 0;
        snap.forEach(d => total += d.data().rating);
        
        const newReviewCount = snap.size;
        const newRating = newReviewCount > 0 ? total / newReviewCount : 0;
        
        await updateDoc(doc(db, COLL_DESTINATIONS, destId), {
            rating: newRating,
            reviewCount: newReviewCount
        });

        showToast("Ulasan berhasil dihapus!");
        
        // 3. REFRESH TAMPILAN
        const viewManager = document.getElementById('view-manager');
        const viewDetail = document.getElementById('view-detail');

        // Cek jika sedang di Dashboard Manager
        if (viewManager && !viewManager.classList.contains('hidden')) {
            await loadManagerReviews(destId); // Refresh List Manager
            // Update angka rating di dashboard
            document.getElementById('mgr-avg-rating').innerText = newRating.toFixed(1);
            document.getElementById('mgr-total-reviews').innerText = newReviewCount;
        } 
        // Cek jika sedang di Halaman Detail Public
        else if (viewDetail && !viewDetail.classList.contains('hidden')) {
            await loadReviews(destId); // Refresh List Public
            // Update angka rating di detail
            document.getElementById('detail-avg-rating').innerText = newRating.toFixed(1);
            document.getElementById('detail-total-reviews').innerText = newReviewCount + ' ulasan';
        }

    } catch(err) {
        console.error(err);
        alert("Gagal menghapus: " + err.message);
    } finally {
        document.body.style.cursor = 'default';
    }
};

const mgrInputFile = document.getElementById('edit-dest-file');
const mgrPreviewImg = document.getElementById('preview-current-img');

if (mgrInputFile) {
    mgrInputFile.addEventListener('change', function(e) {
        const file = e.target.files[0];
        
        if (file) {
            // 1. Validasi Ukuran (Opsional: Max 1MB biar tidak berat)
            if (file.size > 1 * 1024 * 1024) {
                alert("Ukuran file terlalu besar! Maksimal 1MB.");
                this.value = ""; // Reset input
                return;
            }

            // 2. Baca File sebagai URL Data (Base64)
            const reader = new FileReader();
            
            reader.onload = function(e) {
                // Saat selesai dibaca, langsung pasang ke src gambar preview
                if (mgrPreviewImg) {
                    mgrPreviewImg.src = e.target.result;
                    // Tambahkan efek sedikit biar ketahuan berubah
                    mgrPreviewImg.classList.add('ring-4', 'ring-indigo-300');
                    setTimeout(() => mgrPreviewImg.classList.remove('ring-4', 'ring-indigo-300'), 1000);
                }
            }
            
            reader.readAsDataURL(file);
        }
    });
}

// 2. LOAD DATA SAAT LOGIN
async function loadManagerData() {
    if(userData.status !== 'active') {
        alert("Akun belum aktif atau diblokir.");
        window.navigate('home');
        return;
    }
    const snap = await getDoc(doc(db, COLL_DESTINATIONS, currentUser.uid));
    
    let d = {
        name: '', category: 'Alam', lat: '', lng: '', image: '', description: '',
        rating: 0, reviewCount: 0
    };

    if(snap.exists()) {
        d = snap.data();
    }

    document.getElementById('edit-dest-name').value = d.name || '';
    document.getElementById('edit-dest-category').value = d.category || 'Alam';
    document.getElementById('edit-dest-lat').value = d.lat || '';
    document.getElementById('edit-dest-lng').value = d.lng || '';
    document.getElementById('edit-dest-desc').value = d.description || '';
    
    // Tampilkan gambar dari DB jika ada
    const currentImg = (d.image && d.image.length > 20) ? d.image : 'https://via.placeholder.com/150?text=No+Image';
    const previewEl = document.getElementById('preview-current-img');
    if(previewEl) { 
        previewEl.src = currentImg;
        document.getElementById('edit-dest-file').value = ""; 
    }

    document.getElementById('mgr-avg-rating').innerText = d.rating?.toFixed(1) || '0.0';
    document.getElementById('mgr-total-reviews').innerText = d.reviewCount || 0;
    
    loadManagerReviews(currentUser.uid);
}
document.getElementById('form-update-dest').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btnSubmit = e.target.querySelector('button[type="submit"]');
    const originalText = btnSubmit.innerHTML;
    
    try {
        btnSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan...';
        btnSubmit.disabled = true;

        let updatedData = {
            name: document.getElementById('edit-dest-name').value,
            category: document.getElementById('edit-dest-category').value,
            lat: document.getElementById('edit-dest-lat').value,
            lng: document.getElementById('edit-dest-lng').value,
            description: document.getElementById('edit-dest-desc').value,
            managerId: currentUser.uid,
            isSetup: true
        };

        const fileInput = document.getElementById('edit-dest-file');
        
        // LOGIKA SIMPAN: FILE LOKAL -> TEKS BASE64 -> DATABASE
        if (fileInput && fileInput.files.length > 0) {
            const file = fileInput.files[0];
            
            // Cek ukuran lagi untuk keamanan
            if(file.size > 500 * 1024) {
                throw new Error("Ukuran foto terlalu besar! Maksimal 500KB.");
            }

            // Ubah file jadi teks panjang
            const base64Image = await convertToBase64(file);
            updatedData.image = base64Image; 
        }

        // Simpan ke Database (Tanpa perlu Izin Storage Server)
        await setDoc(doc(db, COLL_DESTINATIONS, currentUser.uid), updatedData, { merge: true });
        
        showToast('Perubahan berhasil disimpan!');

    } catch(err) { 
        console.error(err);
        alert('Gagal Menyimpan: ' + err.message); 
    } finally {
        btnSubmit.innerHTML = originalText;
        btnSubmit.disabled = false;
    }
});

// --- FUNGSI BARU: HANDLE BALAS ULASAN ---
window.handleReply = async (reviewId, destId) => {
    // 1. Ambil elemen input berdasarkan ID unik review
    const inputEl = document.getElementById(`reply-input-${reviewId}`);
    const replyText = inputEl.value.trim();
    
    // 2. Validasi
    if(!replyText) return alert("Balasan tidak boleh kosong!");
    
    // 3. Efek Loading pada tombol (Optional, biar keren)
    const btn = event.target; // Tombol yang diklik
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    btn.disabled = true;

    try {
        // 4. Update Database
        await updateDoc(doc(db, COLL_REVIEWS, reviewId), {
            reply: replyText,
            replyDate: new Date().toISOString()
        });
        
        showToast("Balasan berhasil disimpan!");
        
        // 5. Refresh List agar tampilan berubah
        loadManagerReviews(destId); 

    } catch(err) {
        console.error(err);
        alert("Gagal membalas: " + err.message);
        // Kembalikan tombol jika gagal
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
};

// --- UPDATE: FUNGSI LOAD MANAGER REVIEWS (TOMBOL HAPUS SELALU MUNCUL) ---
// --- UPDATE: FUNGSI LOAD MANAGER REVIEWS (DENGAN FOTO PROFIL) ---
async function loadManagerReviews(uid) {
    const list = document.getElementById('mgr-reviews-list');
    
    // Spinner Loading
    list.innerHTML = '<div class="text-center py-6"><i class="fa-solid fa-spinner fa-spin text-2xl text-indigo-400"></i></div>';

    const q = query(collection(db, COLL_REVIEWS), where("destId", "==", uid));
    
    try {
        const snap = await getDocs(q);
        if (snap.empty) {
            list.innerHTML = '<div class="text-center py-10 bg-slate-50 rounded-xl border border-dashed border-slate-300 text-slate-500">Belum ada ulasan masuk.</div>';
            return;
        }

        let html = '';
        snap.forEach(doc => {
            const r = doc.data();
            const rid = doc.id;
            const safeReply = r.reply ? r.reply.replace(/'/g, "&apos;") : '';

            // --- LOGIKA FOTO PROFIL (BARU) ---
            let avatarHtml = '';
            if (r.userPhoto && r.userPhoto.length > 20) {
                // Jika ada foto, tampilkan img
                avatarHtml = `<img src="${r.userPhoto}" alt="${r.userName}" class="w-10 h-10 rounded-full object-cover border border-slate-200 mr-3 bg-white shadow-sm">`;
            } else {
                // Jika tidak ada, tampilkan inisial huruf dengan background abu-abu
                avatarHtml = `
                <div class="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold mr-3 border border-slate-200">
                    ${r.userName.charAt(0).toUpperCase()}
                </div>`;
            }
            // ---------------------------------
            
            // Section Balasan (Biarkan logika ini tetap sama)
            const replySection = r.reply 
            ? `<div id="reply-display-${rid}" class="mt-3 bg-indigo-50 p-4 rounded-lg border-l-4 border-indigo-500">
                <div class="flex justify-between items-start mb-2">
                    <p class="text-xs font-bold text-indigo-700 uppercase"><i class="fa-solid fa-reply mr-1"></i> Balasan Anda</p>
                    <div class="flex space-x-3">
                        <button onclick="document.getElementById('reply-display-${rid}').classList.add('hidden');document.getElementById('reply-form-${rid}').classList.remove('hidden');document.getElementById('reply-input-${rid}').value = '${safeReply}';" class="text-xs text-indigo-600 font-bold hover:underline"><i class="fa-solid fa-pen"></i> Edit</button>
                        <button onclick="window.deleteReply('${rid}', '${uid}')" class="text-xs text-red-500 font-bold hover:underline"><i class="fa-solid fa-trash"></i> Hapus</button>
                    </div>
                </div>
                <p class="text-sm text-slate-700 italic">"${r.reply}"</p>
               </div>
               <div id="reply-form-${rid}" class="hidden mt-3 border-t border-slate-100 pt-3">
                    <textarea id="reply-input-${rid}" rows="3" class="w-full border p-3 rounded-lg text-sm mb-2 focus:ring-2 focus:ring-indigo-500 outline-none">${r.reply}</textarea>
                    <div class="flex justify-end space-x-2">
                        <button onclick="document.getElementById('reply-display-${rid}').classList.remove('hidden'); document.getElementById('reply-form-${rid}').classList.add('hidden');" class="px-3 py-1.5 text-xs font-bold text-slate-500 bg-slate-100 rounded">Batal</button>
                        <button onclick="window.handleReply('${rid}', '${uid}')" class="bg-indigo-600 text-white px-4 py-1.5 rounded text-xs font-bold hover:bg-indigo-700">Simpan</button>
                    </div>
               </div>` 
            : `<div class="mt-4 pt-3 border-t border-slate-100">
                <p class="text-xs text-slate-400 mb-2">Belum dibalas.</p>
                <textarea id="reply-input-${rid}" rows="2" placeholder="Tulis balasan..." class="w-full border p-3 rounded-lg text-sm mb-2 focus:ring-2 focus:ring-indigo-500 outline-none"></textarea>
                <div class="flex justify-end">
                    <button onclick="window.handleReply('${rid}', '${uid}')" class="bg-white border border-indigo-600 text-indigo-600 px-4 py-2 rounded-lg text-xs font-bold hover:bg-indigo-50 transition"><i class="fa-solid fa-paper-plane mr-1"></i> Kirim</button>
                </div>
               </div>`;

            // Render HTML Card
            html += `
            <div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm mb-6 hover:shadow-md transition">
                <div class="flex justify-between items-start mb-3">
                    <div class="flex items-center">
                        
                        <!-- Panggil variabel avatarHtml di sini -->
                        ${avatarHtml}
                        
                        <div>
                            <div class="font-bold text-slate-800 text-sm">${r.userName}</div>
                            <div class="text-xs text-slate-400">${new Date(r.date).toLocaleDateString()}</div>
                        </div>
                    </div>
                    <div class="flex flex-col items-end">
                        <div class="text-yellow-500 text-sm mb-1">
                            ${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}
                        </div>
                        
                        <button onclick="window.deleteReview('${rid}', '${uid}', '${r.userId}')" class="text-xs text-red-400 hover:text-red-600 font-bold mt-2 transition duration-300 cursor-pointer">
                            <i class="fa-solid fa-trash-can mr-1"></i> Hapus Ulasan
                        </button>
                        
                    </div>
                </div>
                <div class="pl-13 mb-4">
                     <p class="text-slate-600 text-sm leading-relaxed">"${r.comment}"</p>
                </div>
                ${replySection}
            </div>`;
        });
        
        list.innerHTML = html;
    } catch (err) {
        console.error(err);
        list.innerHTML = '<p class="text-red-400 text-sm text-center">Gagal memuat ulasan.</p>';
    }
}

// Smooth Scroll untuk Navigasi Dokumentasi
document.querySelectorAll('#view-docs a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const targetId = this.getAttribute('href').substring(1);
        const targetEl = document.getElementById(targetId);
        if (targetEl) {
            targetEl.scrollIntoView({
                behavior: 'smooth'
            });
        }
    });
});

// ... (Kode selanjutnya) ...

// Tab Switching Manager
const tabEdit = document.getElementById('tab-mgr-edit');
const tabRev = document.getElementById('tab-mgr-reviews');
tabEdit.addEventListener('click', () => {
    document.getElementById('mgr-content-edit').classList.remove('hidden');
    document.getElementById('mgr-content-reviews').classList.add('hidden');
    tabEdit.classList.add('active-tab'); tabEdit.classList.remove('text-slate-500');
    tabRev.classList.remove('active-tab'); tabRev.classList.add('text-slate-500');
});
tabRev.addEventListener('click', () => {
    document.getElementById('mgr-content-edit').classList.add('hidden');
    document.getElementById('mgr-content-reviews').classList.remove('hidden');
    tabRev.classList.add('active-tab'); tabRev.classList.remove('text-slate-500');
    tabEdit.classList.remove('active-tab'); tabEdit.classList.add('text-slate-500');
});