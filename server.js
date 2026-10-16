import express from "express";
import cookieParser from "cookie-parser";
import crypto from "crypto";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
dotenv.config();

import admin from "firebase-admin";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin SDK securely using environment variables
if (!admin.apps.length) {
  try {
    const privateKey = process.env.FIREBASE_PRIVATE_KEY 
      ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') 
      : undefined;

    if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && privateKey) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: privateKey
        })
      });
      console.log("Firebase Admin SDK initialized successfully.");
    } else {
      console.warn("Firebase Admin credentials missing or incomplete in environment variables.");
    }
  } catch (e) {
    console.error("Firebase Admin SDK initialization error:", e.message);
  }
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname)));

const tokenStore = new Map();
const oauthSessionStore = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [state, session] of oauthSessionStore.entries()) {
    if (now - session.createdAt > 15 * 60 * 1000) {
      oauthSessionStore.delete(state);
    }
  }
}, 15 * 60 * 1000);

async function verifyFirebaseToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized: No token provided" });
  }
  
  const idToken = authHeader.split("Bearer ")[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error("Firebase token verification failed:", error.message);
    return res.status(403).json({ error: "Unauthorized: Invalid or expired token" });
  }
}

app.get("/api/auth/x/login", async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).send("Missing Firebase authentication token.");

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    const uid = decoded.uid;

    const state = crypto.randomBytes(16).toString("hex");
    const verifier = crypto.randomBytes(32).toString("base64url");
    const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");

    oauthSessionStore.set(state, { uid, verifier, createdAt: Date.now() });

    const clientId = process.env.X_CLIENT_ID;
    const redirectUri = process.env.X_CALLBACK_URL;
    const scope = encodeURIComponent("tweet.read users.read follows.read like.read offline.access");

    const authUrl = `https://twitter.com/i/oauth2/authorize?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&state=${state}&code_challenge=${challenge}&code_challenge_method=S256`;

    res.redirect(authUrl);
  } catch (err) {
    console.error("X login init error:", err.message);
    res.status(401).send("Authentication session verification failed.");
  }
});

app.get("/api/auth/x/callback", async (req, res) => {
  const { code, state, error } = req.query;
  
  if (error) {
    return res.status(400).send(`X Authorization error: ${error}`);
  }

  if (!state || !oauthSessionStore.has(state)) {
    return res.status(400).send("Invalid or expired OAuth state parameter.");
  }

  const session = oauthSessionStore.get(state);
  oauthSessionStore.delete(state);

  const { uid, verifier } = session;
  const clientId = process.env.X_CLIENT_ID;
  const clientSecret = process.env.X_CLIENT_SECRET;
  const redirectUri = process.env.X_CALLBACK_URL;

  const tokenUrl = "https://api.x.com/2/oauth2/token";
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  try {
    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        code,
        grant_type: "authorization_code",
        client_id: clientId,
        redirect_uri: redirectUri,
        code_verifier: verifier
      })
    });

    const tokenData = await response.json();
    
    if (!response.ok) {
      console.error("X Token Exchange Failed:", JSON.stringify(tokenData, null, 2));
      return res.status(400).send(`Failed to exchange token with X: ${tokenData.error_description || tokenData.error || 'Unknown error'}`);
    }

    tokenStore.set(uid, {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: Date.now() + (tokenData.expires_in || 7200) * 1000
    });

    res.redirect("/");
  } catch (err) {
    console.error("Callback execution error:", err.message);
    res.status(500).send("Internal server error during X connection.");
  }
});

// Comprehensive Dashboard Endpoint with Robust Timeline and Error Diagnostics
app.get("/api/x/data", verifyFirebaseToken, async (req, res) => {
  const uid = req.user.uid;
  const tokenData = tokenStore.get(uid);

  if (!tokenData || !tokenData.accessToken) {
    return res.json({ connected: false });
  }

  const accessToken = tokenData.access_token || tokenData.accessToken;
  const paginationToken = req.query.pagination_token ? `&pagination_token=${req.query.pagination_token}` : "";

  try {
    // 1. Fetch User Profile (/2/users/me)
    const profileRes = await fetch("https://api.x.com/2/users/me?user.fields=profile_image_url,description,name,username,public_metrics,created_at,verified", {
      headers: { "Authorization": `Bearer ${accessToken}` }
    });

    if (!profileRes.ok) {
      if (profileRes.status === 401 || profileRes.status === 403) {
        tokenStore.delete(uid);
        return res.json({ connected: false, error: "X session expired or unauthorized." });
      }
      return res.status(502).json({ connected: false, error: "Failed to retrieve profile from X API." });
    }

    const profileJson = await profileRes.json();
    const xUser = profileJson.data;

    // 2. Fetch User Timeline (/2/users/:id/tweets) with Error Diagnostics
    const tweetsUrl = `https://api.x.com/2/users/${xUser.id}/tweets?tweet.fields=created_at,public_metrics,text,attachments,referenced_tweets&max_results=20${paginationToken}`;
    const tweetsRes = await fetch(tweetsUrl, {
      headers: { "Authorization": `Bearer ${accessToken}` }
    });

    let postsData = [];
    let postsMeta = {};
    let postsError = null;

    if (tweetsRes.ok) {
      const tweetsJson = await tweetsRes.json();
      postsData = tweetsJson.data || [];
      postsMeta = tweetsJson.meta || {};
    } else {
      const errBody = await tweetsRes.json().catch(() => ({}));
      console.warn(`Timeline API fetch failed [HTTP ${tweetsRes.status}]:`, errBody);
      postsError = {
        status: tweetsRes.status,
        title: errBody.title || (tweetsRes.status === 402 ? "Payment Required / Credits Exhausted" : tweetsRes.status === 403 ? "Access Restricted" : "API Error"),
        detail: errBody.detail || `X API returned status ${tweetsRes.status}. Please check your X Developer Portal access tier and credits.`
      };
    }

    const posts = postsData.filter(t => !t.referenced_tweets || !t.referenced_tweets.some(ref => ref.type === 'replied_to'));
    const replies = postsData.filter(t => t.referenced_tweets && t.referenced_tweets.some(ref => ref.type === 'replied_to'));
    const mediaPosts = postsData.filter(t => t.attachments && t.attachments.media_keys);

    // 3. Fetch Liked Tweets
    const likesRes = await fetch(`https://api.x.com/2/users/${xUser.id}/liked_tweets?tweet.fields=created_at,public_metrics,text&max_results=10`, {
      headers: { "Authorization": `Bearer ${accessToken}` }
    });
    const likesJson = likesRes.ok ? await likesRes.json() : { data: [] };
    const likedPosts = likesJson.data || [];

    // 4. Fetch Followers & Following
    const followersRes = await fetch(`https://api.x.com/2/users/${xUser.id}/followers?user.fields=profile_image_url,description,name,username,public_metrics,verified&max_results=20`, {
      headers: { "Authorization": `Bearer ${accessToken}` }
    });
    const followersJson = followersRes.ok ? await followersRes.json() : { data: [] };

    const followingRes = await fetch(`https://api.x.com/2/users/${xUser.id}/following?user.fields=profile_image_url,description,name,username,public_metrics,verified&max_results=20`, {
      headers: { "Authorization": `Bearer ${accessToken}` }
    });
    const followingJson = followingRes.ok ? await followingRes.json() : { data: [] };

    res.json({
      connected: true,
      profile: xUser,
      posts: posts,
      replies: replies,
      media: mediaPosts,
      likes: likedPosts,
      followers: followersJson.data || [],
      following: followingJson.data || [],
      meta: postsMeta,
      errors: {
        posts: postsError
      }
    });
  } catch (err) {
    console.error("API fetch error:", err.message);
    res.status(500).json({ error: "Failed to retrieve X data due to a server error." });
  }
});

app.get("/api/x/user/:id", verifyFirebaseToken, async (req, res) => {
  const uid = req.user.uid;
  const tokenData = tokenStore.get(uid);
  const targetUserId = req.params.id;

  if (!tokenData || !tokenData.accessToken) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const accessToken = tokenData.access_token || tokenData.accessToken;

  try {
    const profileRes = await fetch(`https://api.x.com/2/users/${targetUserId}?user.fields=profile_image_url,description,name,username,public_metrics,created_at,verified`, {
      headers: { "Authorization": `Bearer ${accessToken}` }
    });

    if (!profileRes.ok) {
      return res.status(404).json({ error: "Target user profile not found or restricted." });
    }

    const profileJson = await profileRes.json();
    const targetUser = profileJson.data;

    const tweetsRes = await fetch(`https://api.x.com/2/users/${targetUserId}/tweets?tweet.fields=created_at,public_metrics,text&max_results=10`, {
      headers: { "Authorization": `Bearer ${accessToken}` }
    });
    const tweetsJson = tweetsRes.ok ? await tweetsRes.json() : { data: [] };

    res.json({
      profile: targetUser,
      posts: tweetsJson.data || []
    });
  } catch (err) {
    console.error("Target user fetch error:", err.message);
    res.status(500).json({ error: "Failed to retrieve target user data." });
  }
});

app.post("/api/x/disconnect", verifyFirebaseToken, (req, res) => {
  const uid = req.user.uid;
  tokenStore.delete(uid);
  res.json({ success: true });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
  console.log(`apleema.ai server running locally at http://localhost:${PORT}`);
});
