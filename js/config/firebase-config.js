// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyC7z0-VbRyoIai8v7jkH0YLiEpUElBnfzw",
  authDomain: "cakepos-76286.firebaseapp.com",
  projectId: "cakepos-76286",
  storageBucket: "cakepos-76286.firebasestorage.app",
  messagingSenderId: "259836949744",
  appId: "1:259836949744:web:c80e8c34fb4bd666a07e35",
  measurementId: "G-WT80HH3WRD"
};

// Initialize Firebase using the compat SDK (loaded via CDN in index.html)
let app, auth, db, storage;

try {
    app = firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db = firebase.firestore();
    // storage = firebase.storage(); // Uncomment if storage script is added
    console.log("Firebase initialized successfully.");
    
    // Disable mock login button if real Firebase is loaded
    document.addEventListener('DOMContentLoaded', () => {
        const mockBtn = document.getElementById('mock-login-btn');
        if (mockBtn) {
            mockBtn.style.display = 'none';
        }
    });

} catch (error) {
    console.error("Firebase initialization failed:", error);
}

// Export to window for global access
window.firebaseApp = app;
window.firebaseAuth = auth;
window.firebaseDb = db;
window.firebaseConfig = firebaseConfig;
// window.firebaseStorage = storage;
