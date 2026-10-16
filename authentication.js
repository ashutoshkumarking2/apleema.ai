import { auth, googleProvider } from "./firebase.js";
import { signInWithPopup } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

export async function handleGoogleSignIn() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    if (!user.emailVerified) {
      console.warn("User email is not verified, but proceeding with session establishment.");
    }
    return user;
  } catch (error) {
    console.error("Google Sign-In Error:", error.message);
    throw error;
  }
}