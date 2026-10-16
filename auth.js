import { auth } from "./firebase.js";
import { onAuthStateChanged, signOut as fbSignOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

export function initAuthObserver(onUserAuthenticated, onUserUnauthenticated) {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      try {
        const idToken = await user.getIdToken();
        onUserAuthenticated(user, idToken);
      } catch (err) {
        console.error("Failed to retrieve Firebase ID token:", err);
        onUserUnauthenticated();
      }
    } else {
      onUserUnauthenticated();
    }
  });
}

export async function getAuthToken() {
  const user = auth.currentUser;
  if (!user) return null;
  return await user.getIdToken();
}

export async function logoutUser() {
  try {
    await fbSignOut(auth);
    window.location.href = "/";
  } catch (err) {
    console.error("Logout error:", err);
  }
}