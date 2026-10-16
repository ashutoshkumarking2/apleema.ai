import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAVqQKAK7Ou0Wj7yRaWLpjXyw7cD7GCk6Y",
  authDomain: "aivora-ai-fc66b.firebaseapp.com",
  projectId: "aivora-ai-fc66b",
  storageBucket: "aivora-ai-fc66b.firebasestorage.app",
  messagingSenderId: "504131514451",
  appId: "1:504131514451:web:8d699f879c1fd1f6e556a6",
  measurementId: "G-K0XB3P3QC9"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();